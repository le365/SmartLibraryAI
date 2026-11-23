CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Reader'
    CHECK (role IN ('Admin', 'Librarian', 'Reader')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE readers (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  reader_code TEXT NOT NULL UNIQUE,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended')),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE books (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  isbn TEXT UNIQUE,
  category TEXT NOT NULL DEFAULT 'Khác',
  description TEXT NOT NULL DEFAULT '',
  total_copies INTEGER NOT NULL DEFAULT 1
    CHECK (total_copies >= 0),
  available_copies INTEGER NOT NULL DEFAULT 1
    CHECK (available_copies >= 0 AND available_copies <= total_copies),
  is_active INTEGER NOT NULL DEFAULT 1
    CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE borrowings (
  id TEXT PRIMARY KEY NOT NULL,
  reader_id TEXT NOT NULL REFERENCES readers(id),
  book_id TEXT NOT NULL REFERENCES books(id),
  borrowed_by TEXT NOT NULL REFERENCES users(id),
  borrowed_at TEXT NOT NULL,
  due_at TEXT NOT NULL,
  returned_at TEXT,
  status TEXT NOT NULL DEFAULT 'borrowed'
    CHECK (status IN ('borrowed', 'returned')),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE returns (
  id TEXT PRIMARY KEY NOT NULL,
  borrowing_id TEXT NOT NULL UNIQUE REFERENCES borrowings(id),
  processed_by TEXT NOT NULL REFERENCES users(id),
  returned_at TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT ''
) STRICT;

CREATE INDEX idx_sessions_user_expiry ON sessions(user_id, expires_at);
CREATE INDEX idx_readers_status ON readers(status);
CREATE INDEX idx_books_title ON books(title);
CREATE INDEX idx_books_category ON books(category);
CREATE INDEX idx_borrowings_reader_status ON borrowings(reader_id, status);
CREATE INDEX idx_borrowings_book_status ON borrowings(book_id, status);
CREATE INDEX idx_borrowings_due_at ON borrowings(due_at);

INSERT INTO books (
  id, title, author, isbn, category, description,
  total_copies, available_copies, created_at, updated_at
) VALUES
  ('book-1001', 'Tư duy thiết kế trong thời đại số', 'Nguyễn Minh An', '978-604-1-10001-2', 'Công nghệ', 'Tài liệu tham khảo về tư duy thiết kế.', 12, 12, datetime('now'), datetime('now')),
  ('book-1002', 'Những mùa gió qua miền ký ức', 'Lê Thu Hà', '978-604-1-10002-9', 'Văn học', 'Tác phẩm văn học tiếng Việt.', 9, 9, datetime('now'), datetime('now')),
  ('book-1003', 'Dữ liệu lớn và ứng dụng', 'Trần Quang Huy', '978-604-1-10003-6', 'Công nghệ', 'Nhập môn dữ liệu lớn và các ứng dụng.', 15, 15, datetime('now'), datetime('now')),
  ('book-1004', 'Kinh tế học hành vi', 'Phạm Gia Bảo', '978-604-1-10004-3', 'Kinh tế', 'Khái niệm nền tảng về kinh tế học hành vi.', 7, 7, datetime('now'), datetime('now')),
  ('book-1005', 'Khám phá thế giới tự nhiên', 'Đỗ Khánh Linh', '978-604-1-10005-0', 'Khoa học', 'Sách khoa học phổ thông.', 10, 10, datetime('now'), datetime('now'));
