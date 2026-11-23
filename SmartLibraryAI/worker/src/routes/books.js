import { Hono } from "hono";
import { ApiError, integerInRange, optionalHttpsUrl, optionalText, pagination, readJsonObject, requiredText, successResponse } from "../lib/errors.js";
import { requireDb } from "../lib/db.js";
import { resolveCategory } from "../lib/catalog.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";

const books = new Hono();
const staffRoles = ["Admin", "Librarian"];
const MAX_COVER_SIZE = 5 * 1024 * 1024;
const coverExtensions = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const bookSelect = `
  SELECT books.id, books.title, books.author, books.publisher, books.isbn, books.category_id,
    categories.name AS category_name, books.description, books.total_copies,
    books.available_copies, books.cover_url, books.cover_object_key,
    books.cover_content_type, books.cover_size, books.is_active,
    books.created_at, books.updated_at
  FROM books JOIN categories ON categories.id = books.category_id
`;

function mapBook(book) {
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    publisher: book.publisher,
    isbn: book.isbn,
    categoryId: book.category_id,
    category: book.category_name,
    description: book.description,
    coverUrl: book.cover_object_key
      ? `/api/books/${encodeURIComponent(book.id)}/cover`
      : book.cover_url,
    coverContentType: book.cover_content_type,
    coverSize: book.cover_size,
    totalCopies: book.total_copies,
    availableCopies: book.available_copies,
    isActive: Boolean(book.is_active),
    createdAt: book.created_at,
    updatedAt: book.updated_at,
  };
}

async function removeR2Object(bucket, key) {
  try {
    await bucket.delete(key);
    return true;
  } catch (error) {
    console.error("Could not delete an R2 book cover", { key, message: error.message });
    return false;
  }
}

function isPng(bytes) {
  return bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
}

function isJpeg(bytes) {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function isWebp(bytes) {
  return bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
}

books.get("/:id/cover", async (c) => {
  const db = requireDb(c.env);
  const book = await db.prepare(`
    SELECT cover_object_key, cover_content_type
    FROM books WHERE id = ? AND is_active = 1
  `).bind(c.req.param("id")).first();
  if (!book?.cover_object_key) {
    throw new ApiError(404, "COVER_NOT_FOUND", "This book does not have an uploaded cover.");
  }
  const bucket = c.env.BOOK_COVERS;
  if (!bucket) throw new ApiError(503, "R2_NOT_CONFIGURED", "The book cover storage is not configured.");
  const object = await bucket.get(book.cover_object_key);
  if (!object) throw new ApiError(404, "COVER_NOT_FOUND", "The uploaded book cover was not found.");

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", book.cover_content_type);
  headers.set("Content-Length", String(object.size));
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=3600");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(object.body, { headers });
});

books.use("*", requireAuth);

books.get("/", async (c) => {
  const db = requireDb(c.env);
  const { limit, offset } = pagination(c);
  const search = (c.req.query("search") || "").trim().slice(0, 100);
  const category = (c.req.query("category") || "").trim().slice(0, 80);
  const conditions = ["books.is_active = 1"];
  const values = [];
  if (search) {
    conditions.push("(books.title LIKE ? OR books.author LIKE ? OR books.publisher LIKE ? OR books.isbn LIKE ?)");
    const pattern = `%${search}%`;
    values.push(pattern, pattern, pattern, pattern);
  }
  if (category) {
    conditions.push("categories.name = ?");
    values.push(category);
  }
  const where = conditions.join(" AND ");
  const [rows, count] = await Promise.all([
    db.prepare(`${bookSelect}
      WHERE ${where}
      ORDER BY books.title COLLATE NOCASE LIMIT ? OFFSET ?
    `).bind(...values, limit, offset).all(),
    db.prepare(`
      SELECT COUNT(*) AS total FROM books
      JOIN categories ON categories.id = books.category_id WHERE ${where}
    `).bind(...values).first(),
  ]);
  return successResponse(c, {
    items: rows.results.map(mapBook),
    pagination: { limit, offset, total: count.total },
  });
});

books.get("/:id", async (c) => {
  const db = requireDb(c.env);
  const book = await db.prepare(`${bookSelect}
    WHERE books.id = ? AND books.is_active = 1
  `).bind(c.req.param("id")).first();
  if (!book) throw new ApiError(404, "BOOK_NOT_FOUND", "Book was not found.");
  return successResponse(c, { book: mapBook(book) });
});

books.post("/:id/cover", requireRoles(...staffRoles), async (c) => {
  const bucket = c.env.BOOK_COVERS;
  if (!bucket) throw new ApiError(503, "R2_NOT_CONFIGURED", "The book cover storage is not configured.");

  const db = requireDb(c.env);
  const bookId = c.req.param("id");
  const currentBook = await db.prepare(`
    SELECT cover_object_key FROM books WHERE id = ? AND is_active = 1
  `).bind(bookId).first();
  if (!currentBook) throw new ApiError(404, "BOOK_NOT_FOUND", "Book was not found.");

  const contentType = c.req.header("content-type") || "";
  if (!/^multipart\/form-data(?:\s*;|$)/i.test(contentType)) {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Cover uploads must use multipart/form-data.");
  }
  const contentLength = Number(c.req.header("content-length") || 0);
  if (contentLength > MAX_COVER_SIZE + 65536) {
    throw new ApiError(413, "COVER_TOO_LARGE", "Book cover images must be at most 5 MB.");
  }

  let form;
  try {
    form = await c.req.formData();
  } catch {
    throw new ApiError(400, "INVALID_MULTIPART", "The uploaded form data is invalid.");
  }
  const files = form.getAll("file");
  const file = files[0];
  if (files.length !== 1 || !file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
    throw new ApiError(400, "INVALID_COVER", "Upload exactly one image file in the file field.");
  }
  if (file.size < 1) throw new ApiError(400, "INVALID_COVER", "The cover image cannot be empty.");
  if (file.size > MAX_COVER_SIZE) {
    throw new ApiError(413, "COVER_TOO_LARGE", "Book cover images must be at most 5 MB.");
  }

  const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const detectedType = isJpeg(signature)
    ? "image/jpeg"
    : isPng(signature)
      ? "image/png"
      : isWebp(signature)
        ? "image/webp"
        : null;
  if (!detectedType || file.type !== detectedType) {
    throw new ApiError(415, "UNSUPPORTED_COVER_FORMAT", "Only valid JPEG, PNG, and WebP images are supported.");
  }

  const key = `covers/${crypto.randomUUID()}.${coverExtensions[detectedType]}`;
  const now = new Date().toISOString();
  const bytes = await file.arrayBuffer();
  await bucket.put(key, bytes, {
    httpMetadata: {
      contentType: detectedType,
      cacheControl: "public, max-age=3600",
    },
  });

  let result;
  try {
    result = await db.prepare(`
      UPDATE books
      SET cover_object_key = ?, cover_content_type = ?, cover_size = ?,
        cover_url = NULL, updated_at = ?
      WHERE id = ? AND is_active = 1 AND cover_object_key IS ?
    `).bind(key, detectedType, file.size, now, bookId, currentBook.cover_object_key).run();
  } catch (error) {
    await removeR2Object(bucket, key);
    throw error;
  }
  if (result.meta.changes !== 1) {
    await removeR2Object(bucket, key);
    throw new ApiError(409, "COVER_UPDATE_CONFLICT", "The book cover changed during upload. Refresh and try again.");
  }

  const cleanupPending = currentBook.cover_object_key
    ? !await removeR2Object(bucket, currentBook.cover_object_key)
    : false;
  const savedBook = await db.prepare(`${bookSelect}
    WHERE books.id = ? AND books.is_active = 1
  `).bind(bookId).first();
  return successResponse(c, { book: mapBook(savedBook), cleanupPending });
});

books.delete("/:id/cover", requireRoles(...staffRoles), async (c) => {
  const bucket = c.env.BOOK_COVERS;
  if (!bucket) throw new ApiError(503, "R2_NOT_CONFIGURED", "The book cover storage is not configured.");

  const db = requireDb(c.env);
  const bookId = c.req.param("id");
  const currentBook = await db.prepare(`
    SELECT cover_object_key, cover_url
    FROM books WHERE id = ? AND is_active = 1
  `).bind(bookId).first();
  if (!currentBook) throw new ApiError(404, "BOOK_NOT_FOUND", "Book was not found.");

  const result = await db.prepare(`
    UPDATE books
    SET cover_object_key = NULL, cover_content_type = NULL, cover_size = NULL,
      cover_url = NULL, updated_at = ?
    WHERE id = ? AND is_active = 1
      AND cover_object_key IS ? AND cover_url IS ?
  `).bind(new Date().toISOString(), bookId, currentBook.cover_object_key, currentBook.cover_url).run();
  if (result.meta.changes !== 1) {
    throw new ApiError(409, "COVER_UPDATE_CONFLICT", "The book cover changed during removal. Refresh and try again.");
  }

  const cleanupPending = currentBook.cover_object_key
    ? !await removeR2Object(bucket, currentBook.cover_object_key)
    : false;
  const savedBook = await db.prepare(`${bookSelect}
    WHERE books.id = ? AND books.is_active = 1
  `).bind(bookId).first();
  return successResponse(c, { book: mapBook(savedBook), cleanupPending });
});

books.post("/", requireRoles(...staffRoles), async (c) => {
  const body = await readJsonObject(c);
  const title = requiredText(body.title, "title", { max: 200 });
  const author = requiredText(body.author, "author", { max: 160 });
  const publisher = optionalText(body.publisher, "publisher", { max: 160 });
  const isbn = body.isbn === undefined || body.isbn === null || body.isbn === ""
    ? null
    : requiredText(body.isbn, "isbn", { max: 24 });
  const description = optionalText(body.description, "description", { max: 2000 });
  const coverUrl = optionalHttpsUrl(body.coverUrl, "coverUrl");
  const totalCopies = integerInRange(body.totalCopies ?? 1, "totalCopies", { min: 1, max: 10000 });
  const db = requireDb(c.env);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  if (isbn) {
    const duplicate = await db.prepare("SELECT id FROM books WHERE isbn = ?").bind(isbn).first();
    if (duplicate) throw new ApiError(409, "ISBN_ALREADY_EXISTS", "A book with this ISBN already exists.");
  }
  const category = await resolveCategory(db, {
    categoryId: body.categoryId,
    categoryName: body.category ?? body.categoryName,
    defaultName: "Khác",
  });

  const inserted = await db.prepare(`
    INSERT INTO books (
      id, title, author, publisher, isbn, category_id, description,
      total_copies, available_copies, cover_url, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(isbn) DO NOTHING
  `).bind(id, title, author, publisher, isbn, category.id, description, totalCopies, totalCopies, coverUrl, now, now).run();
  if (inserted.meta.changes === 0) {
    throw new ApiError(409, "ISBN_ALREADY_EXISTS", "A book with this ISBN already exists.");
  }

  return successResponse(c, {
    book: {
      id, title, author, publisher, isbn, categoryId: category.id, category: category.name, description,
      coverUrl, totalCopies, availableCopies: totalCopies, isActive: true, createdAt: now, updatedAt: now,
    },
  }, 201);
});

books.patch("/:id", requireRoles(...staffRoles), async (c) => {
  const body = await readJsonObject(c);
  const editableFields = {
    title: (value) => requiredText(value, "title", { max: 200 }),
    author: (value) => requiredText(value, "author", { max: 160 }),
    publisher: (value) => optionalText(value, "publisher", { max: 160 }),
    isbn: (value) => value === null || value === "" ? null : requiredText(value, "isbn", { max: 24 }),
    description: (value) => optionalText(value, "description", { max: 2000 }),
    coverUrl: optionalHttpsUrl,
  };
  const updates = Object.entries(editableFields)
    .filter(([field]) => Object.hasOwn(body, field))
    .map(([field, validate]) => [field, validate(body[field], "coverUrl")]);
  const totalCopies = Object.hasOwn(body, "totalCopies")
    ? integerInRange(body.totalCopies, "totalCopies", { min: 1, max: 10000 })
    : null;
  const hasCategory = Object.hasOwn(body, "category") || Object.hasOwn(body, "categoryName") || Object.hasOwn(body, "categoryId");
  if (!updates.length && !hasCategory && totalCopies === null) {
    throw new ApiError(400, "VALIDATION_ERROR", "Provide at least one editable book field.");
  }

  const db = requireDb(c.env);
  const now = new Date().toISOString();
  const bookId = c.req.param("id");
  const currentBook = await db.prepare(`
    SELECT id, total_copies, available_copies, cover_object_key
    FROM books WHERE id = ? AND is_active = 1
  `)
    .bind(bookId).first();
  if (!currentBook) throw new ApiError(404, "BOOK_NOT_FOUND", "Book was not found.");
  const coverUrlUpdate = updates.find(([field]) => field === "coverUrl");
  if (coverUrlUpdate && currentBook.cover_object_key && !c.env.BOOK_COVERS) {
    throw new ApiError(503, "R2_NOT_CONFIGURED", "The book cover storage is not configured.");
  }
  const checkedOutCopies = currentBook.total_copies - currentBook.available_copies;
  if (totalCopies !== null && totalCopies < checkedOutCopies) {
    throw new ApiError(409, "INVALID_STOCK_REDUCTION", "Total copies cannot be lower than the number currently borrowed.");
  }
  const isbnUpdate = updates.find(([field]) => field === "isbn");
  if (isbnUpdate && isbnUpdate[1]) {
    const duplicate = await db.prepare("SELECT id FROM books WHERE isbn = ? AND id != ?")
      .bind(isbnUpdate[1], bookId).first();
    if (duplicate) throw new ApiError(409, "ISBN_ALREADY_EXISTS", "A book with this ISBN already exists.");
  }
  const category = hasCategory
    ? await resolveCategory(db, {
      categoryId: body.categoryId,
      categoryName: body.category ?? body.categoryName,
    })
    : null;
  const assignments = updates.map(([field]) => `${field} = ?`);
  const values = updates.map(([, value]) => value);
  if (totalCopies !== null) {
    assignments.push("total_copies = ?", "available_copies = ?");
    values.push(totalCopies, totalCopies - checkedOutCopies);
  }
  if (coverUrlUpdate) {
    assignments.push("cover_object_key = NULL", "cover_content_type = NULL", "cover_size = NULL");
  }
  let isbnConflict = false;
  if (isbnUpdate && isbnUpdate[1]) {
    isbnConflict = true;
  }
  if (category) {
    assignments.push("category_id = ?");
    values.push(category.id);
  }
  assignments.push("updated_at = ?");
  values.push(now, bookId);
  const uniquenessGuard = isbnConflict
    ? "AND NOT EXISTS (SELECT 1 FROM books AS other WHERE other.isbn = ? AND other.id != books.id)"
    : "";
  if (isbnConflict) values.push(isbnUpdate[1]);
  const result = await db.prepare(`
    UPDATE books SET ${assignments.join(", ")}
    WHERE id = ? AND is_active = 1 ${uniquenessGuard}
  `).bind(...values).run();
  if (result.meta.changes === 0) {
    if (isbnConflict) throw new ApiError(409, "ISBN_ALREADY_EXISTS", "A book with this ISBN already exists.");
    throw new ApiError(404, "BOOK_NOT_FOUND", "Book was not found.");
  }
  const cleanupPending = coverUrlUpdate && currentBook.cover_object_key
    ? !await removeR2Object(c.env.BOOK_COVERS, currentBook.cover_object_key)
    : false;

  const updated = await db.prepare(`${bookSelect}
    WHERE books.id = ?
  `).bind(c.req.param("id")).first();
  return successResponse(c, { book: mapBook(updated), cleanupPending });
});

books.delete("/:id", requireRoles("Admin"), async (c) => {
  const db = requireDb(c.env);
  const activeLoans = await db.prepare(`
    SELECT COUNT(*) AS total FROM borrowings WHERE book_id = ? AND status = 'borrowed'
  `).bind(c.req.param("id")).first();
  if (activeLoans.total > 0) {
    throw new ApiError(409, "BOOK_HAS_ACTIVE_LOANS", "Return all active copies before archiving this book.");
  }
  const result = await db.prepare(`
    UPDATE books SET is_active = 0, updated_at = ?
    WHERE id = ? AND is_active = 1
  `).bind(new Date().toISOString(), c.req.param("id")).run();
  if (result.meta.changes === 0) throw new ApiError(404, "BOOK_NOT_FOUND", "Book was not found.");
  return successResponse(c, { id: c.req.param("id"), archived: true });
});

export default books;
