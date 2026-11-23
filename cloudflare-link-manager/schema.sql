PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS links (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL,
    original_url TEXT NOT NULL,
    short_code   TEXT NOT NULL UNIQUE,
    custom_alias TEXT UNIQUE,
    title        TEXT,
    expires_at   TEXT,
    is_active    INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    click_count  INTEGER NOT NULL DEFAULT 0 CHECK (click_count >= 0),
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS click_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    link_id     INTEGER NOT NULL,
    clicked_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    user_agent  TEXT,
    device_type TEXT,
    country     TEXT,
    referer     TEXT,
    FOREIGN KEY (link_id) REFERENCES links (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_links_user_created
    ON links (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_links_active_expiry
    ON links (is_active, expires_at);

CREATE INDEX IF NOT EXISTS idx_click_logs_link_clicked
    ON click_logs (link_id, clicked_at DESC);

CREATE INDEX IF NOT EXISTS idx_click_logs_country
    ON click_logs (country);

CREATE INDEX IF NOT EXISTS idx_click_logs_device
    ON click_logs (device_type);
