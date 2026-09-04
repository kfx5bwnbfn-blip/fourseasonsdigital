-- Baymard UX Tracker — Database Schema
-- Run automatically by the Node app on startup, but can also be run manually.

CREATE TABLE IF NOT EXISTS status_overrides (
    item_key VARCHAR(255) PRIMARY KEY,
    status VARCHAR(100) NOT NULL,
    updated_by VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS status_history (
    id SERIAL PRIMARY KEY,
    item_key VARCHAR(255) NOT NULL,
    old_status VARCHAR(100),
    new_status VARCHAR(100) NOT NULL,
    changed_by VARCHAR(255) NOT NULL,
    note TEXT,
    changed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_history_item_key ON status_history(item_key);
CREATE INDEX IF NOT EXISTS idx_history_changed_at ON status_history(changed_at);
