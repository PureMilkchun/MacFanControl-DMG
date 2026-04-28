const DOWNLOAD_TARGET = "/iFanControl-macOS.zip";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function current15mBucketStartUnix() {
  const now = Math.floor(Date.now() / 1000);
  return Math.floor(now / 900) * 900;
}

function bucket15IndexForUnix(unixSeconds) {
  const date = new Date(unixSeconds * 1000);
  return date.getUTCHours() * 4 + Math.floor(date.getUTCMinutes() / 15);
}

function dayKeyForUnix(unixSeconds) {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

export async function onRequestGet({ request, env }) {
  if (env.IFAN_DB) {
    const db = env.IFAN_DB;
    const day = todayKey();
    const bucket15 = current15mBucketStartUnix();
    const bucket15Day = dayKeyForUnix(bucket15);
    const bucket15Index = bucket15IndexForUnix(bucket15);

    await db.batch([
      db.prepare(`INSERT INTO counters (key, value) VALUES ('download:total', 1)
        ON CONFLICT(key) DO UPDATE SET value = value + 1`),
      db.prepare(`INSERT INTO counters (key, value) VALUES ('download:${day}', 1)
        ON CONFLICT(key) DO UPDATE SET value = value + 1`),
      db.prepare(`INSERT INTO series_15m (day, bucket_index, kind, value)
        VALUES (?, ?, 'download', 1)
        ON CONFLICT(day, kind, bucket_index) DO UPDATE SET value = value + 1`)
        .bind(bucket15Day, bucket15Index),
    ]);
  }

  return Response.redirect(new URL(DOWNLOAD_TARGET, request.url), 302);
}

export async function onRequestHead({ request }) {
  return Response.redirect(new URL(DOWNLOAD_TARGET, request.url), 302);
}
