ALTER TABLE books
  ADD COLUMN publisher TEXT NOT NULL DEFAULT ''
  CHECK (length(publisher) <= 160);

ALTER TABLE books
  ADD COLUMN cover_url TEXT
  CHECK (cover_url IS NULL OR length(cover_url) <= 2048);
