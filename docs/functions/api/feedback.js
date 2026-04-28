const MAX_BODY_BYTES = 16384; // 反馈内容 + 心跳事件

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

function cleanToken(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.replace(/[^a-zA-Z0-9._@-]/g, "").slice(0, maxLength);
}

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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
  const content = typeof payload.content === "string" ? payload.content.trim().slice(0, 2000) : "";
  const email = cleanToken(payload.email, 120);
  const version = cleanToken(payload.version, 24) || "unknown";
  const build = cleanToken(String(payload.build || ""), 12) || "0";

  if (installId.length < 16 || !content) {
    return jsonResponse({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const db = env.IFAN_DB;
  const installHash = await sha256Hex(installId);
  const nowUnix = Math.floor(Date.now() / 1000);

  // 服务端限流：每小时最多 5 条反馈
  const hourAgo = nowUnix - 3600;
  const recentCount = await db.prepare(
    "SELECT COUNT(*) as cnt FROM feedback WHERE install_hash = ? AND created_at > ?"
  ).bind(installHash, hourAgo).first();
  if (recentCount && recentCount.cnt >= 5) {
    return jsonResponse({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  // 写入反馈
  await db.prepare(
    "INSERT INTO feedback (install_hash, content, email, version, created_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(installHash, content, email, `${version}-${build}`, nowUnix).run();

  // 处理顺便带来的心跳事件（可选，兼容老版本不带 events 的情况）
  const events = Array.isArray(payload.events) ? payload.events : [];
  let heartbeatProcessed = 0;

  if (events.length > 0 && events.length <= 192) {
    const versionBuild = `${version}-${build}`;

    // 按 (day, bucket_index) 去重
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
    const days = [...new Set(uniqueBuckets.map(b => b.day))];

    // 批量插入桶活动记录
    const bucketStmts = uniqueBuckets.map(b =>
      db.prepare("INSERT OR IGNORE INTO bucket_activity (install_hash, day, bucket_index, first_seen, last_seen, version) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(installHash, b.day, b.idx, nowUnix, nowUnix, versionBuild)
    );
    await db.batch(bucketStmts);

    // 批量插入去重标记
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

    // 检查新天数和新安装
    const newDays = [];
    for (let i = 0; i < days.length; i++) {
      if (flagResults[i].meta.changes > 0) newDays.push(days[i]);
    }
    const isNewInstall = flagResults[days.length].meta.changes > 0;

    // 批量更新计数器
    const counterStmts = [];
    for (const day of newDays) {
      counterStmts.push(
        db.prepare(`INSERT INTO counters (key, value) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET value = value + 1`).bind(`daily:${day}:unique`),
        db.prepare(`INSERT INTO counters (key, value) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET value = value + 1`).bind(`daily:${day}:events`),
      );
    }
    if (isNewInstall) {
      counterStmts.push(
        db.prepare(`INSERT INTO counters (key, value) VALUES ('all_time_unique', 1) ON CONFLICT(key) DO UPDATE SET value = value + 1`)
      );
    }
    for (const day of days) {
      const versionFlagIdx = days.length + 1 + days.indexOf(day);
      if (flagResults[versionFlagIdx].meta.changes > 0) {
        counterStmts.push(
          db.prepare(`INSERT INTO counters (key, value) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET value = value + 1`).bind(`version:${day}:${versionBuild}:unique`)
        );
      }
    }
    if (counterStmts.length > 0) {
      await db.batch(counterStmts);
    }

    // 更新 15 分钟活跃用户时序（为请求中涉及的每个桶重算，兼容每日批量上报）
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

    // 清理过期数据
    await db.batch([
      db.prepare("DELETE FROM flags WHERE created_at < ?").bind(nowUnix - 86400 * 60),
      db.prepare("DELETE FROM counters WHERE expires_at IS NOT NULL AND expires_at < ?").bind(nowUnix),
    ]);

    heartbeatProcessed = events.length;
  }

  return jsonResponse({ ok: true, heartbeat_events: heartbeatProcessed });
}

export async function onRequestGet() {
  return jsonResponse({ ok: false, error: "method_not_allowed" }, { status: 405 });
}
