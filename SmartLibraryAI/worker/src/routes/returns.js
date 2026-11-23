import { Hono } from "hono";
import { ApiError, optionalText, pagination, readJsonObject, successResponse } from "../lib/errors.js";
import { requireDb } from "../lib/db.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";

const returns = new Hono();

returns.use("*", requireAuth, requireRoles("Admin", "Librarian"));

returns.get("/", async (c) => {
  const db = requireDb(c.env);
  const { limit, offset } = pagination(c);
  const [rows, count] = await Promise.all([
    db.prepare(`
      SELECT returns.id, returns.borrowing_id, returns.processed_by, returns.returned_at, returns.note,
        borrowings.reader_id, readers.reader_code, users.name AS reader_name,
        borrowings.book_id, books.title AS book_title
      FROM returns
      JOIN borrowings ON borrowings.id = returns.borrowing_id
      JOIN readers ON readers.id = borrowings.reader_id
      JOIN users ON users.id = readers.user_id
      JOIN books ON books.id = borrowings.book_id
      ORDER BY returns.returned_at DESC LIMIT ? OFFSET ?
    `).bind(limit, offset).all(),
    db.prepare("SELECT COUNT(*) AS total FROM returns").first(),
  ]);
  return successResponse(c, {
    items: rows.results.map((row) => ({
      id: row.id,
      borrowingId: row.borrowing_id,
      processedBy: row.processed_by,
      returnedAt: row.returned_at,
      note: row.note,
      readerId: row.reader_id,
      readerCode: row.reader_code,
      readerName: row.reader_name,
      bookId: row.book_id,
      bookTitle: row.book_title,
    })),
    pagination: { limit, offset, total: count.total },
  });
});

returns.post("/:borrowingId", async (c) => {
  const body = await readJsonObject(c);
  const note = optionalText(body.note, "note", { max: 1000 });
  const db = requireDb(c.env);
  const borrowingId = c.req.param("borrowingId");
  const returnedAt = new Date().toISOString();
  const returnId = crypto.randomUUID();
  const borrowing = await db.prepare(`
    SELECT book_id FROM borrowings WHERE id = ? AND status = 'borrowed'
  `).bind(borrowingId).first();
  if (!borrowing) throw new ApiError(404, "ACTIVE_BORROWING_NOT_FOUND", "An active borrowing record was not found.");

  const results = await db.batch([
    db.prepare(`
      UPDATE borrowings SET status = 'returned', returned_at = ?
      WHERE id = ? AND status = 'borrowed'
      AND EXISTS (
        SELECT 1 FROM books
        WHERE books.id = borrowings.book_id
          AND books.available_copies < books.total_copies
      )
    `).bind(returnedAt, borrowingId),
    db.prepare(`
      UPDATE books SET available_copies = available_copies + 1, updated_at = ?
      WHERE id = ? AND changes() = 1 AND available_copies < total_copies
    `).bind(returnedAt, borrowing.book_id),
    db.prepare(`
      INSERT INTO returns (id, borrowing_id, processed_by, returned_at, note)
      SELECT ?, ?, ?, ?, ? WHERE changes() = 1
    `).bind(returnId, borrowingId, c.get("auth").id, returnedAt, note),
  ]);
  if (results.some((result) => result.meta.changes !== 1)) {
    throw new ApiError(409, "RETURN_CONFLICT", "The borrowing record could not be returned. Refresh and try again.");
  }
  return successResponse(c, {
    return: { id: returnId, borrowingId, processedBy: c.get("auth").id, returnedAt, note },
  }, 201);
});

export default returns;
