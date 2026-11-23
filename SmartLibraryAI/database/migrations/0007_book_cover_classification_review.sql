INSERT INTO categories (id, name, created_at)
SELECT lower(hex(randomblob(16))), 'Công nghệ thông tin', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Công nghệ thông tin');

INSERT INTO categories (id, name, created_at)
SELECT lower(hex(randomblob(16))), 'Toán học', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Toán học');

INSERT INTO categories (id, name, created_at)
SELECT lower(hex(randomblob(16))), 'Khoa học', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Khoa học');

INSERT INTO categories (id, name, created_at)
SELECT lower(hex(randomblob(16))), 'Ngoại ngữ', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Ngoại ngữ');

INSERT INTO categories (id, name, created_at)
SELECT lower(hex(randomblob(16))), 'Kinh tế', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Kinh tế');

INSERT INTO categories (id, name, created_at)
SELECT lower(hex(randomblob(16))), 'Văn học', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Văn học');

ALTER TABLE ai_classifications
  ADD COLUMN predicted_category_id TEXT REFERENCES categories(id) ON DELETE SET NULL;

UPDATE ai_classifications
SET predicted_category_id = category_id
WHERE predicted_category_id IS NULL;

ALTER TABLE ai_classifications
  ADD COLUMN review_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (review_status IN ('pending', 'confirmed', 'corrected'));

ALTER TABLE ai_classifications
  ADD COLUMN reviewed_by TEXT REFERENCES users(id);

ALTER TABLE ai_classifications
  ADD COLUMN reviewed_at TEXT;
