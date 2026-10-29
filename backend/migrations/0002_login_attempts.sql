-- Failed sign-in counters for rate limiting. One row per key ("ip:<address>" or "email:<sha256 of email>"),
-- counting failures since window_start. The email is hashed so made-up addresses can't fill the table with arbitrary text.
CREATE TABLE login_attempts (
  key          TEXT PRIMARY KEY,
  count        INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);

CREATE INDEX idx_login_attempts_window ON login_attempts (window_start);
