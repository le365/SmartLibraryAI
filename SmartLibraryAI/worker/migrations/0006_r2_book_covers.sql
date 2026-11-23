ALTER TABLE books
  ADD COLUMN cover_object_key TEXT
  CHECK (cover_object_key IS NULL OR length(cover_object_key) BETWEEN 1 AND 512);

ALTER TABLE books
  ADD COLUMN cover_content_type TEXT
  CHECK (
    cover_content_type IS NULL
    OR cover_content_type IN ('image/jpeg', 'image/png', 'image/webp')
  );

ALTER TABLE books
  ADD COLUMN cover_size INTEGER
  CHECK (cover_size IS NULL OR cover_size BETWEEN 1 AND 5242880);

CREATE UNIQUE INDEX idx_books_cover_object_key
  ON books(cover_object_key)
  WHERE cover_object_key IS NOT NULL;
