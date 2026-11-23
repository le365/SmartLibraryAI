import { Hono } from "hono";
import { ApiError, integerInRange, pagination, readJsonObject, successResponse } from "../lib/errors.js";
import { requireDb } from "../lib/db.js";
import { requireAuth } from "../middleware/auth.js";

const borrowings = new Hono();
const staffRoles = ["Admin", "Librarian"];

function mapBorrowing(row) {
  const isOverdue = row.status === "borrowed" && row.due_at < new Date().toISOString();
  return {
    id: row.id,
    readerId: row.reader_id,
    readerName: row.reader_name,
    readerCode: row.reader_code,
    bookId: row.book_id,
    bookTitle: row.book_title,
    borrowedBy: row.borrowed_by,
    borrowedAt: row.borrowed_at,
    dueAt: row.due_at,
    returnedAt: row.returned_at,
    status: row.status,
    isOverdue,
  };
}

function mapRequest(row) {
  return {
    id: row.id,
    readerId: row.reader_id,
    readerName: row.reader_name,
    readerCode: row.reader_code,
    bookId: row.book_id,
    bookTitle: row.book_title,
    availableCopies: row.available_copies,
    requestedAt: row.requested_at,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    note: row.note,
  };
}

const requestSelect = `
  SELECT borrow_requests.id, borrow_requests.reader_id, readers.reader_code,
    users.name AS reader_name, borrow_details.book_id, books.title AS book_title,
    books.available_copies, borrow_requests.requested_at, borrow_requests.status,
    borrow_requests.reviewed_by, borrow_requests.reviewed_at, borrow_requests.note
  FROM borrow_requests
  JOIN readers ON readers.id = borrow_requests.reader_id
  JOIN users ON users.id = readers.user_id
  JOIN borrow_details ON borrow_details.request_id = borrow_requests.id
  JOIN books ON books.id = borrow_details.book_id
`;

borrowings.use("*", requireAuth);

borrowings.get("/requests", async (c) => {
  const user = c.get("auth");
  const db = requireDb(c.env);
  const { limit, offset } = pagination(c);
  const conditions = [];
  const values = [];
  if (user.role === "Reader") {
    conditions.push("borrow_requests.reader_id = ?");
    values.push(user.readerId);
  } else if (staffRoles.includes(user.role)) {
    const status = c.req.query("status");
    if (status && !["pending", "approved", "rejected", "cancelled"].includes(status)) {
      throw new ApiError(400, "VALIDATION_ERROR", "Invalid borrow request status.");
    }
    if (status) {
      conditions.push("borrow_requests.status = ?");
      values.push(status);
    }
  } else {
    throw new ApiError(403, "FORBIDDEN", "Your role is not allowed to view borrowing requests.");
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [rows, count] = await Promise.all([
    db.prepare(`${requestSelect} ${where}
      ORDER BY borrow_requests.requested_at DESC LIMIT ? OFFSET ?
    `).bind(...values, limit, offset).all(),
    db.prepare(`SELECT COUNT(*) AS total FROM borrow_requests ${where}`)
      .bind(...values).first(),
  ]);
  return successResponse(c, {
    items: rows.results.map(mapRequest),
    pagination: { limit, offset, total: count.total },
  });
});

borrowings.post("/requests", async (c) => {
  const user = c.get("auth");
  if (user.role !== "Reader" || !user.readerId) {
    throw new ApiError(403, "FORBIDDEN", "Only readers can request to borrow books.");
  }
  const body = await readJsonObject(c);
  const bookId = typeof body.bookId === "string" && body.bookId.trim()
    ? body.bookId.trim()
    : null;
  if (!bookId || bookId.length > 100) {
    throw new ApiError(400, "VALIDATION_ERROR", "bookId must be a non-empty string.");
  }
  const db = requireDb(c.env);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const results = await db.batch([
    db.prepare(`
      INSERT INTO borrow_requests (id, reader_id, requested_at, status, created_at)
      SELECT ?, ?, ?, 'pending', ?
      WHERE EXISTS (
        SELECT 1 FROM readers
        WHERE id = ? AND status = 'active'
      )
      AND EXISTS (
        SELECT 1 FROM books
        WHERE id = ? AND is_active = 1 AND available_copies > 0
      )
    `).bind(id, user.readerId, now, now, user.readerId, bookId),
    db.prepare(`
      INSERT INTO borrow_details (id, request_id, book_id, quantity, created_at)
      SELECT ?, ?, ?, 1, ? WHERE changes() = 1
    `).bind(crypto.randomUUID(), id, bookId, now),
  ]);
  if (results[0].meta.changes !== 1 || results[1].meta.changes !== 1) {
    const book = await db.prepare("SELECT is_active, available_copies FROM books WHERE id = ?")
      .bind(bookId).first();
    if (!book || !book.is_active) throw new ApiError(404, "BOOK_NOT_FOUND", "An active book was not found.");
    if (book.available_copies < 1) {
      throw new ApiError(409, "BOOK_UNAVAILABLE", "No copies of this book are currently available.");
    }
    throw new ApiError(409, "BORROW_REQUEST_CONFLICT", "The borrowing request could not be created.");
  }
  return successResponse(c, {
    request: { id, readerId: user.readerId, bookId, requestedAt: now, status: "pending" },
  }, 201);
});

borrowings.post("/requests/:id/review", async (c) => {
  const user = c.get("auth");
  if (!staffRoles.includes(user.role)) {
    throw new ApiError(403, "FORBIDDEN", "Only library staff can review borrowing requests.");
  }
  const body = await readJsonObject(c);
  if (!["approved", "rejected"].includes(body.decision)) {
    throw new ApiError(400, "VALIDATION_ERROR", "decision must be approved or rejected.");
  }
  const note = typeof body.note === "undefined"
    ? ""
    : body.note;
  if (typeof note !== "string" || note.trim().length > 1000) {
    throw new ApiError(400, "VALIDATION_ERROR", "note must be text with at most 1000 characters.");
  }

  const db = requireDb(c.env);
  const requestId = c.req.param("id");
  const request = await db.prepare(`
    SELECT borrow_requests.reader_id, borrow_details.book_id, books.is_active
    FROM borrow_requests
    JOIN borrow_details ON borrow_details.request_id = borrow_requests.id
    JOIN books ON books.id = borrow_details.book_id
    WHERE borrow_requests.id = ? AND borrow_requests.status = 'pending'
  `).bind(requestId).first();
  if (!request) {
    throw new ApiError(404, "PENDING_REQUEST_NOT_FOUND", "A pending borrowing request was not found.");
  }

  const now = new Date().toISOString();
  if (body.decision === "rejected") {
    const result = await db.prepare(`
      UPDATE borrow_requests
      SET status = 'rejected', reviewed_by = ?, reviewed_at = ?, note = ?
      WHERE id = ? AND status = 'pending'
    `).bind(user.id, now, note.trim(), requestId).run();
    if (result.meta.changes !== 1) {
      throw new ApiError(409, "REQUEST_REVIEW_CONFLICT", "This request was already reviewed.");
    }
    return successResponse(c, {
      request: { id: requestId, status: "rejected", reviewedBy: user.id, reviewedAt: now, note: note.trim() },
    });
  }

  const dueDays = integerInRange(body.dueDays ?? 14, "dueDays", { min: 1, max: 90 });
  if (!request.is_active) throw new ApiError(409, "BOOK_UNAVAILABLE", "This book is no longer available.");
  const borrowedAt = now;
  const dueAt = new Date(Date.now() + dueDays * 86400000).toISOString();
  const borrowingId = crypto.randomUUID();
  const results = await db.batch([
    db.prepare(`
      UPDATE books SET available_copies = available_copies - 1, updated_at = ?
      WHERE id = ? AND is_active = 1 AND available_copies > 0
      AND EXISTS (
        SELECT 1 FROM borrow_requests
        WHERE id = ? AND status = 'pending'
      )
    `).bind(now, request.book_id, requestId),
    db.prepare(`
      UPDATE borrow_requests
      SET status = 'approved', reviewed_by = ?, reviewed_at = ?, note = ?
      WHERE id = ? AND status = 'pending' AND changes() = 1
    `).bind(user.id, now, note.trim(), requestId),
    db.prepare(`
      INSERT INTO borrowings (
        id, reader_id, book_id, borrowed_by, borrowed_at, due_at, status, created_at
      )
      SELECT ?, ?, ?, ?, ?, ?, 'borrowed', ?
      WHERE changes() = 1
    `).bind(borrowingId, request.reader_id, request.book_id, user.id, borrowedAt, dueAt, now),
  ]);
  if (results.some((result) => result.meta.changes !== 1)) {
    throw new ApiError(409, "BOOK_UNAVAILABLE", "No copies of this book are currently available, or the request was already reviewed.");
  }
  return successResponse(c, {
    request: { id: requestId, status: "approved", reviewedBy: user.id, reviewedAt: now },
    borrowing: {
      id: borrowingId,
      readerId: request.reader_id,
      bookId: request.book_id,
      borrowedBy: user.id,
      borrowedAt,
      dueAt,
      returnedAt: null,
      status: "borrowed",
      isOverdue: false,
    },
  });
});

borrowings.get("/", async (c) => {
  const user = c.get("auth");
  const db = requireDb(c.env);
  const { limit, offset } = pagination(c);
  const status = c.req.query("status");
  if (status && !["borrowed", "returned"].includes(status)) {
    throw new ApiError(400, "VALIDATION_ERROR", "status must be borrowed or returned.");
  }
  const conditions = [];
  const values = [];
  if (user.role === "Reader") {
    conditions.push("borrowings.reader_id = ?");
    values.push(user.readerId);
  } else if (!staffRoles.includes(user.role)) {
    throw new ApiError(403, "FORBIDDEN", "Your role is not allowed to view borrowing records.");
  }
  if (status) {
    conditions.push("borrowings.status = ?");
    values.push(status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [rows, count] = await Promise.all([
    db.prepare(`
      SELECT borrowings.id, borrowings.reader_id, readers.reader_code, users.name AS reader_name,
        borrowings.book_id, books.title AS book_title, borrowings.borrowed_by,
        borrowings.borrowed_at, borrowings.due_at, borrowings.returned_at, borrowings.status
      FROM borrowings
      JOIN readers ON readers.id = borrowings.reader_id
      JOIN users ON users.id = readers.user_id
      JOIN books ON books.id = borrowings.book_id
      ${where}
      ORDER BY borrowings.borrowed_at DESC LIMIT ? OFFSET ?
    `).bind(...values, limit, offset).all(),
    db.prepare(`SELECT COUNT(*) AS total FROM borrowings ${where}`).bind(...values).first(),
  ]);
  return successResponse(c, {
    items: rows.results.map(mapBorrowing),
    pagination: { limit, offset, total: count.total },
  });
});

borrowings.post("/", async (c) => {
  const user = c.get("auth");
  if (!staffRoles.includes(user.role)) {
    throw new ApiError(403, "FORBIDDEN", "Only library staff can create borrowing records directly.");
  }
  const body = await readJsonObject(c);
  const bookId = typeof body.bookId === "string" && body.bookId.trim()
    ? body.bookId.trim()
    : null;
  if (!bookId || bookId.length > 100) {
    throw new ApiError(400, "VALIDATION_ERROR", "bookId must be a non-empty string.");
  }
  const dueDays = integerInRange(body.dueDays ?? 14, "dueDays", { min: 1, max: 90 });
  if (typeof body.readerId !== "string" || !body.readerId.trim()) {
    throw new ApiError(400, "VALIDATION_ERROR", "readerId is required for staff-created borrowings.");
  }
  const readerId = body.readerId.trim();

  const db = requireDb(c.env);
  const [reader, book] = await Promise.all([
    db.prepare("SELECT id, status FROM readers WHERE id = ?").bind(readerId).first(),
    db.prepare("SELECT id, is_active, available_copies FROM books WHERE id = ?").bind(bookId).first(),
  ]);
  if (!reader || reader.status !== "active") {
    throw new ApiError(404, "READER_NOT_FOUND", "An active reader profile was not found.");
  }
  if (!book || !book.is_active) throw new ApiError(404, "BOOK_NOT_FOUND", "An active book was not found.");
  if (book.available_copies < 1) throw new ApiError(409, "BOOK_UNAVAILABLE", "No copies of this book are currently available.");

  const now = new Date();
  const borrowedAt = now.toISOString();
  const dueAt = new Date(now.getTime() + dueDays * 86400000).toISOString();
  const id = crypto.randomUUID();
  const results = await db.batch([
    db.prepare(`
      UPDATE books SET available_copies = available_copies - 1, updated_at = ?
      WHERE id = ? AND is_active = 1 AND available_copies > 0
    `).bind(borrowedAt, bookId),
    db.prepare(`
      INSERT INTO borrowings (id, reader_id, book_id, borrowed_by, borrowed_at, due_at, status, created_at)
      SELECT ?, ?, ?, ?, ?, ?, 'borrowed', ?
      WHERE changes() = 1
    `).bind(id, readerId, bookId, user.id, borrowedAt, dueAt, borrowedAt),
  ]);
  if (results[0].meta.changes !== 1 || results[1].meta.changes !== 1) {
    throw new ApiError(409, "BOOK_UNAVAILABLE", "The last available copy was borrowed by another request.");
  }
  return successResponse(c, {
    borrowing: {
      id, readerId, bookId, borrowedBy: user.id, borrowedAt, dueAt, returnedAt: null, status: "borrowed", isOverdue: false,
    },
  }, 201);
});

borrowings.get("/:id", async (c) => {
  const user = c.get("auth");
  const row = await requireDb(c.env).prepare(`
    SELECT borrowings.id, borrowings.reader_id, readers.reader_code, users.name AS reader_name,
      borrowings.book_id, books.title AS book_title, borrowings.borrowed_by,
      borrowings.borrowed_at, borrowings.due_at, borrowings.returned_at, borrowings.status
    FROM borrowings
    JOIN readers ON readers.id = borrowings.reader_id
    JOIN users ON users.id = readers.user_id
    JOIN books ON books.id = borrowings.book_id
    WHERE borrowings.id = ?
  `).bind(c.req.param("id")).first();
  if (!row || (user.role === "Reader" && row.reader_id !== user.readerId)) {
    throw new ApiError(404, "BORROWING_NOT_FOUND", "Borrowing record was not found.");
  }
  return successResponse(c, { borrowing: mapBorrowing(row) });
});

export default borrowings;
