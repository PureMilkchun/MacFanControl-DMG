const MAX_BODY_BYTES = 4096;

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers || {}),
    },
  });
}

function dayKeyForUnix(unixSeconds) {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

function bucket15IndexForUnix(unixSeconds) {
  const date = new Date(unixSeconds * 1000);
  return date.getUTCHours() * 4 + Math.floor(date.getUTCMinutes() / 15);
}

function bucket15StartUnix(unixSeconds) {
  return Math.floor(unixSeconds / 900) * 900;
}

function cleanToken(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, maxLength);
}

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function onRequestPost({ request, env }) {
  if (!env.IFAN_DB) {
    return jsonResponse({ ok: false, error: "stats_storage_unavailable" }, { status: 503 });
  }

  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > MAX_BODY_BYTES) {
    return jsonResponse({ ok: false, error: "payload_too_large" }, { status: 413 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const installId = cleanToken(payload.install_id, 80);
  const version = cleanToken(payload.version, 24) || "unknown";
  const build = cleanToken(String(payload.build || ""), 12) || "0";
  const nowUnix = Math.floor(Date.now() / 1000);

  // 兼容旧版：没有 events 字段时，视为一条当前时间的心跳事件
  let events = Array.isArray(payload.events) ? payload.events : [];
  if (events.length === 0) {
    events = [{ ts: nowUnix, type: "heartbeat" }];
  }

  if (installId.length < 16) {
    return jsonResponse({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  if (events.length > 96) {
    return jsonResponse({ ok: false, error: "too_many_events" }, { status: 413 });
  }

  const db = env.IFAN_DB;
  const installHash = await sha256Hex(installId);
  const versionBuild = `${version}-${build}`;

  // 去重：按 (day, bucket_index) 分组，每个桶只处理一次
  const bucketsByDay = {};
  for (const ev of events) {
    const ts = typeof ev.ts === "number" ? ev.ts : nowUnix;
    const bucketTs = bucket15StartUnix(ts);
    const day = dayKeyForUnix(bucketTs);
    const idx = bucket15IndexForUnix(bucketTs);
    const key = `${day}:${idx}`;
    if (!bucketsByDay[key]) {
      bucketsByDay[key] = { day, idx, bucketTs };
    }
  }
  const uniqueBuckets = Object.values(bucketsByDay);

  // 收集涉及的日期
  const days = [...new Set(uniqueBuckets.map(b => b.day))];

  // 第 1 步：批量插入桶活动记录（INSERT OR IGNORE，1 次查询）
  const bucketStmts = uniqueBuckets.map(b =>
    db.prepare("INSERT OR IGNORE INTO bucket_activity (install_hash, day, bucket_index, first_seen, last_seen, version) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(installHash, b.day, b.idx, nowUnix, nowUnix, versionBuild)
  );
  await db.batch(bucketStmts);

  // 第 2 步：批量插入去重标记（INSERT OR IGNORE，1 次查询）
  const flagStmts = [
    ...days.map(day =>
      db.prepare("INSERT OR IGNORE INTO flags (key, created_at) VALUES (?, ?)").bind(`daily:${day}:${installHash}`, nowUnix)
    ),
    db.prepare("INSERT OR IGNORE INTO flags (key, created_at) VALUES (?, ?)").bind(`install:${installHash}`, nowUnix),
    ...days.map(day =>
      db.prepare("INSERT OR IGNORE INTO flags (key, created_at) VALUES (?, ?)").bind(`version:${day}:${versionBuild}:${installHash}`, nowUnix)
    ),
  ];
  const flagResults = await db.batch(flagStmts);

  // 检查哪些是新的
  const newDays = [];
  for (let i = 0; i < days.length; i++) {
    if (flagResults[i].meta.changes > 0) newDays.push(days[i]);
  }
  const isNewInstall = flagResults[days.length].meta.changes > 0;

  // 第 3 步：批量更新计数器（1 次查询）
  const counterStmts = [];
  for (const day of newDays) {
    counterStmts.push(
      db.prepare(`INSERT INTO counters (key, value) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET value = value + 1`)
        .bind(`daily:${day}:unique`),
      db.prepare(`INSERT INTO counters (key, value) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET value = value + 1`)
        .bind(`daily:${day}:events`),
    );
  }
  if (isNewInstall) {
    counterStmts.push(
      db.prepare(`INSERT INTO counters (key, value) VALUES ('all_time_unique', 1) ON CONFLICT(key) DO UPDATE SET value = value + 1`)
    );
  }
  // 更新每个版本的每日计数
  for (const day of days) {
    const versionFlagIdx = days.length + 1 + days.indexOf(day);
    if (flagResults[versionFlagIdx].meta.changes > 0) {
      counterStmts.push(
        db.prepare(`INSERT INTO counters (key, value) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET value = value + 1`)
          .bind(`version:${day}:${versionBuild}:unique`)
      );
    }
  }
  if (counterStmts.length > 0) {
    await db.batch(counterStmts);
  }

  // 第 4 步：更新 15 分钟活跃用户时序（为请求中涉及的每个桶重算，兼容每日批量上报）
  for (const bucket of uniqueBuckets) {
    const activeCount = await db.prepare(
      "SELECT COUNT(DISTINCT install_hash) as cnt FROM bucket_activity WHERE day = ? AND bucket_index = ?"
    ).bind(bucket.day, bucket.idx).first();

    if (activeCount) {
      await db.prepare(
        `INSERT INTO series_15m (day, bucket_index, kind, value) VALUES (?, ?, 'active', ?)
         ON CONFLICT(day, kind, bucket_index) DO UPDATE SET value = ?`
      ).bind(bucket.day, bucket.idx, activeCount.cnt, activeCount.cnt).run();
    }
  }

  // 第 5 步：顺手清理过期数据
  await db.batch([
    db.prepare("DELETE FROM flags WHERE created_at < ?").bind(nowUnix - 86400 * 60),
    db.prepare("DELETE FROM counters WHERE expires_at IS NOT NULL AND expires_at < ?").bind(nowUnix),
  ]);

  return jsonResponse({ ok: true, processed: events.length });
}

export async function onRequestGet() {
  return jsonResponse({ ok: false, error: "method_not_allowed" }, { status: 405 });
}
