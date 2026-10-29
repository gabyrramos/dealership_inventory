CREATE TABLE dealerships (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  dealership_id TEXT NOT NULL REFERENCES dealerships (id),
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'viewer')),
  password_hash TEXT NOT NULL
);

CREATE INDEX idx_users_dealership ON users (dealership_id);

-- token_hash is a SHA-256 of the cookie value. Delete the row to end the session.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX idx_sessions_user ON sessions (user_id);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);

-- version goes up by one on every save. A save sent with an old version is rejected.
CREATE TABLE vehicles (
  id            TEXT PRIMARY KEY,
  dealership_id TEXT NOT NULL REFERENCES dealerships (id),
  make          TEXT NOT NULL,
  model         TEXT NOT NULL,
  year          INTEGER NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('available', 'reserved', 'sold')),
  version       INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_at    INTEGER NOT NULL,
  updated_by    TEXT NOT NULL
);

CREATE INDEX idx_vehicles_dealership ON vehicles (dealership_id);
