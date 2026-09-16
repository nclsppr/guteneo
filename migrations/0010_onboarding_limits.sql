-- No IP address is stored. A daily rotating hash bounds hosted login writes.
CREATE TABLE auth_flow_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0 CHECK(count >= 0)
);
CREATE INDEX auth_flow_limits_window ON auth_flow_limits(window_start);
