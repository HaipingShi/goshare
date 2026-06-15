ALTER TABLE pages ADD COLUMN title TEXT;
ALTER TABLE pages ADD COLUMN summary TEXT;
ALTER TABLE pages ADD COLUMN metadata_source TEXT NOT NULL DEFAULT 'fallback';
ALTER TABLE pages ADD COLUMN share_card_theme TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_pages_title ON pages (title);
