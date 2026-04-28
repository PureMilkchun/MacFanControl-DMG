const DEFAULT_DAYS = 7;

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers || {}),
    },
  });
}

function dayOffset(offset) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

export async function onRequestGet({ request, env }) {
  if (!env.IFAN_DB) {
    return jsonResponse({ ok: false, error: "stats_storage_unavailable" }, { status: 503 });
  }

  if (env.STATS_ADMIN_TOKEN) {
    const expected = `Bearer ${env.STATS_ADMIN_TOKEN}`;
    if (request.headers.get("authorization") !== expected) {
      return jsonResponse({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const db = env.IFAN_DB;
  const url = new URL(request.url);
  const days = Math.max(1, Math.min(30, Number(url.searchParams.get("days") || DEFAULT_DAYS)));
  const nowUnix = Math.floor(Date.now() / 1000);

  // 构建日期列表
  const dayList = [];
  for (let offset = 0; offset < days; offset += 1) {
    dayList.push(dayOffset(offset));
  }

  // 批量查询每日数据
  const dailyStmts = dayList.flatMap(day => [
    db.prepare(`SELECT value FROM counters WHERE key = 'download:${day}' AND (expires_at IS NULL OR expires_at > ${nowUnix})`),
    db.prepare(`SELECT value FROM counters WHERE key = 'daily:${day}:unique' AND (expires_at IS NULL OR expires_at > ${nowUnix})`),
    db.prepare(`SELECT value FROM counters WHERE key = 'daily:${day}:events' AND (expires_at IS NULL OR expires_at > ${nowUnix})`),
  ]);

  const globalStmts = [
    db.prepare(`SELECT value FROM counters WHERE key = 'download:total'`),
    db.prepare(`SELECT value FROM counters WHERE key = 'all_time_unique'`),
  ];

  const allResults = await db.batch([...dailyStmts, ...globalStmts]);

  const downloadsTotal = allResults[allResults.length - 2].results?.[0]?.value || 0;
  const activeAllTimeUnique = allResults[allResults.length - 1].results?.[0]?.value || 0;

  const daily = [];
  for (let i = 0; i < days; i++) {
    const base = i * 3;
    daily.push({
      date: dayList[i],
      downloads: allResults[base].results?.[0]?.value || 0,
      active_unique: allResults[base + 1].results?.[0]?.value || 0,
      active_events: allResults[base + 2].results?.[0]?.value || 0,
    });
  }

  // 查询 15 分钟活跃用户时序数据
  const active15mStmts = dayList.map(day =>
    db.prepare(`SELECT bucket_index, value FROM series_15m WHERE day = ? AND kind = 'active' ORDER BY bucket_index`)
      .bind(day)
  );
  const active15mResults = await db.batch(active15mStmts);

  const active15m = {};
  for (let i = 0; i < days; i++) {
    const rows = active15mResults[i].results || [];
    const series = new Array(96).fill(null);
    for (const row of rows) {
      series[row.bucket_index] = row.value;
    }
    active15m[dayList[i]] = series;
  }

  // 查询 15 分钟下载时序数据（最近 7 天）
  const download15mDays = dayList.slice(0, 7);
  const download15mStmts = download15mDays.map(day =>
    db.prepare(`SELECT bucket_index, value FROM series_15m WHERE day = ? AND kind = 'download' ORDER BY bucket_index`)
      .bind(day)
  );
  const download15mResults = await db.batch(download15mStmts);

  const downloads15m = {};
  for (let i = 0; i < download15mDays.length; i++) {
    const rows = download15mResults[i].results || [];
    const series = new Array(96).fill(null);
    for (const row of rows) {
      series[row.bucket_index] = row.value;
    }
    downloads15m[download15mDays[i]] = series;
  }

  return jsonResponse({
    ok: true,
    generated_at: new Date().toISOString(),
    downloads_total: downloadsTotal,
    active_all_time_unique: activeAllTimeUnique,
    daily,
    active_15m: active15m,
    downloads_15m: downloads15m,
  });
}
