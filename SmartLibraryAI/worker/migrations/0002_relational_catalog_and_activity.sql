CREATE TABLE categories (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
) STRICT;

INSERT INTO categories (id, name, created_at)
SELECT lower(hex(randomblob(16))), MIN(trim(category)), datetime('now')
FROM books
WHERE category IS NOT NULL AND trim(category) <> ''
GROUP BY lower(trim(category));

INSERT INTO categories (id, name, created_at)
SELECT lower(hex(randomblob(16))), 'Khác', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Khác');

ALTER TABLE books ADD COLUMN category_id TEXT REFERENCES categories(id);

UPDATE books
SET category_id = (
  SELECT categories.id
  FROM categories
  WHERE categories.name = trim(books.category) COLLATE NOCASE
);

UPDATE books
SET category_id = (SELECT id FROM categories WHERE name = 'Khác')
WHERE category_id IS NULL;

DROP INDEX idx_books_category;
ALTER TABLE books DROP COLUMN category;
CREATE INDEX idx_books_category_id ON books(category_id);

CREATE TRIGGER books_category_required_insert
BEFORE INSERT ON books
WHEN NEW.category_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'books.category_id is required');
END;

CREATE TRIGGER books_category_required_update
BEFORE UPDATE OF category_id ON books
WHEN NEW.category_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'books.category_id is required');
END;

CREATE TABLE borrow_requests (
  id TEXT PRIMARY KEY NOT NULL,
  reader_id TEXT NOT NULL REFERENCES readers(id),
  requested_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE borrow_details (
  id TEXT PRIMARY KEY NOT NULL,
  request_id TEXT NOT NULL REFERENCES borrow_requests(id) ON DELETE CASCADE,
  book_id TEXT NOT NULL REFERENCES books(id),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 100),
  created_at TEXT NOT NULL,
  UNIQUE (request_id, book_id)
) STRICT;

CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL CHECK (length(trim(content)) BETWEEN 1 AND 12000),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE ai_classifications (
  id TEXT PRIMARY KEY NOT NULL,
  book_id TEXT REFERENCES books(id) ON DELETE SET NULL,
  requested_by TEXT NOT NULL REFERENCES users(id),
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  author TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  model TEXT,
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_borrow_requests_reader_status
  ON borrow_requests(reader_id, status, requested_at);
CREATE INDEX idx_borrow_details_book ON borrow_details(book_id);
CREATE INDEX idx_chat_messages_conversation
  ON chat_messages(user_id, conversation_id, created_at);
CREATE INDEX idx_ai_classifications_book_created
  ON ai_classifications(book_id, created_at);
