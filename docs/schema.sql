-- 通用计数器
CREATE TABLE IF NOT EXISTS counters (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER
);

-- 去重标记（flags 替代旧的 seen 表）
CREATE TABLE IF NOT EXISTS flags (
  key TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 15 分钟桶活跃记录（用于聚合活跃用户数）
CREATE TABLE IF NOT EXISTS bucket_activity (
  install_hash TEXT NOT NULL,
  day TEXT NOT NULL,
  bucket_index INTEGER NOT NULL,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  version TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (install_hash, day, bucket_index)
);

-- 15 分钟粒度时序数据
CREATE TABLE IF NOT EXISTS series_15m (
  day TEXT NOT NULL,
  bucket_index INTEGER NOT NULL,
  kind TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind, bucket_index)
);

-- 清理过期数据的索引
CREATE INDEX IF NOT EXISTS idx_counters_expires ON counters(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_flags_created ON flags(created_at);
CREATE INDEX IF NOT EXISTS idx_bucket_activity_day ON bucket_activity(day, bucket_index);
