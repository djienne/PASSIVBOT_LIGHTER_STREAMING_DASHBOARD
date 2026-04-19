-- Dashboard persistence schema. All timestamps are ms since epoch (UTC).

CREATE TABLE IF NOT EXISTS candles (
    t      INTEGER PRIMARY KEY,  -- open time, ms
    o      REAL NOT NULL,
    h      REAL NOT NULL,
    l      REAL NOT NULL,
    c      REAL NOT NULL,
    v      REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS fills (
    event_id      TEXT PRIMARY KEY,
    ts            INTEGER NOT NULL,
    symbol        TEXT NOT NULL,
    side          TEXT NOT NULL,
    qty           REAL NOT NULL,
    price         REAL NOT NULL,
    pnl           REAL NOT NULL,
    position_side TEXT NOT NULL,
    raw_id        TEXT,
    raw_json      TEXT
);

CREATE INDEX IF NOT EXISTS idx_fills_ts ON fills(ts);

CREATE TABLE IF NOT EXISTS positions (
    snapshot_ts   INTEGER PRIMARY KEY,
    side          TEXT NOT NULL,
    size          REAL NOT NULL,
    avg_entry     REAL NOT NULL,
    source        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS balances (
    snapshot_ts INTEGER PRIMARY KEY,
    balance     REAL NOT NULL,
    source      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS order_aggregates (
    snapshot_ts       INTEGER PRIMARY KEY,
    orders_placed     INTEGER NOT NULL,
    orders_cancelled  INTEGER NOT NULL,
    fills_count       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS timeline_events (
    event_id   TEXT PRIMARY KEY,
    ts         INTEGER NOT NULL,
    category   TEXT NOT NULL,
    label      TEXT NOT NULL,
    side       TEXT,
    price      REAL,
    qty        REAL,
    pnl        REAL,
    win_loss   TEXT NOT NULL DEFAULT 'neutral',
    payload    TEXT,
    cursor     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_timeline_ts      ON timeline_events(ts);
CREATE INDEX IF NOT EXISTS idx_timeline_cursor  ON timeline_events(cursor);

CREATE TABLE IF NOT EXISTS metrics_snapshots (
    ts    INTEGER PRIMARY KEY,
    json  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS health_snapshots (
    ts    INTEGER PRIMARY KEY,
    json  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vps_latency_snapshots (
    ts    INTEGER PRIMARY KEY,
    json  TEXT NOT NULL
);

-- Monotonic cursor used for WS reconnect resume.
CREATE TABLE IF NOT EXISTS cursor_state (
    id      INTEGER PRIMARY KEY CHECK (id = 1),
    value   INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO cursor_state (id, value) VALUES (1, 0);
