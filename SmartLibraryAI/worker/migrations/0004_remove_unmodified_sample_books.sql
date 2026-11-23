DELETE FROM books
WHERE is_active = 1
  AND publisher = ''
  AND cover_url IS NULL
  AND available_copies = total_copies
  AND NOT EXISTS (
    SELECT 1 FROM borrowings WHERE borrowings.book_id = books.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM borrow_details WHERE borrow_details.book_id = books.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM ai_classifications WHERE ai_classifications.book_id = books.id
  )
  AND (
    (id = 'book-1001' AND title = 'Tư duy thiết kế trong thời đại số' AND author = 'Nguyễn Minh An' AND isbn = '978-604-1-10001-2' AND description = 'Tài liệu tham khảo về tư duy thiết kế.' AND total_copies = 12)
    OR (id = 'book-1002' AND title = 'Những mùa gió qua miền ký ức' AND author = 'Lê Thu Hà' AND isbn = '978-604-1-10002-9' AND description = 'Tác phẩm văn học tiếng Việt.' AND total_copies = 9)
    OR (id = 'book-1003' AND title = 'Dữ liệu lớn và ứng dụng' AND author = 'Trần Quang Huy' AND isbn = '978-604-1-10003-6' AND description = 'Nhập môn dữ liệu lớn và các ứng dụng.' AND total_copies = 15)
    OR (id = 'book-1004' AND title = 'Kinh tế học hành vi' AND author = 'Phạm Gia Bảo' AND isbn = '978-604-1-10004-3' AND description = 'Khái niệm nền tảng về kinh tế học hành vi.' AND total_copies = 7)
    OR (id = 'book-1005' AND title = 'Khám phá thế giới tự nhiên' AND author = 'Đỗ Khánh Linh' AND isbn = '978-604-1-10005-0' AND description = 'Sách khoa học phổ thông.' AND total_copies = 10)
  );
