-- Independent public evidence only. Never apply to the business database.
CREATE TABLE status_samples (
  bucket INTEGER PRIMARY KEY,
  checked_at TEXT NOT NULL,
  sample_json TEXT NOT NULL CHECK(length(sample_json) <= 65536)
);

CREATE TABLE status_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE status_metrics (
  bucket INTEGER NOT NULL REFERENCES status_samples(bucket) ON DELETE CASCADE,
  day TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('overall', 'pages', 'api', 'access')),
  passed INTEGER NOT NULL CHECK(passed IN (0, 1)),
  latency_sum_ms INTEGER NOT NULL CHECK(latency_sum_ms >= 0),
  latency_count INTEGER NOT NULL CHECK(latency_count > 0),
  PRIMARY KEY (bucket, category)
) WITHOUT ROWID;

CREATE TABLE status_daily (
  day TEXT NOT NULL,
  category TEXT NOT NULL,
  observed_samples INTEGER NOT NULL,
  passed_samples INTEGER NOT NULL,
  latency_sum_ms INTEGER NOT NULL,
  latency_count INTEGER NOT NULL,
  PRIMARY KEY (day, category)
) WITHOUT ROWID;

CREATE TRIGGER status_metrics_daily AFTER INSERT ON status_metrics
BEGIN
  INSERT INTO status_daily (day, category, observed_samples, passed_samples, latency_sum_ms, latency_count)
  VALUES (NEW.day, NEW.category, 1, NEW.passed, NEW.latency_sum_ms, NEW.latency_count)
  ON CONFLICT(day, category) DO UPDATE SET
    observed_samples = observed_samples + 1,
    passed_samples = passed_samples + NEW.passed,
    latency_sum_ms = latency_sum_ms + NEW.latency_sum_ms,
    latency_count = latency_count + NEW.latency_count;
END;
