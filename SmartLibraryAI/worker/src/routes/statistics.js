import { Hono } from "hono";
import { ApiError, integerInRange, successResponse } from "../lib/errors.js";
import { requireDb } from "../lib/db.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";

const statistics = new Hono();
const staffRoles = ["Admin", "Librarian"];

function daysQuery(c) {
  const days = Number(c.req.query("days") || "30");
  return integerInRange(days, "days", { min: 1, max: 365 });
}

statistics.use("*", requireAuth);

statistics.get("/overview", async (c) => {
  const user = c.get("auth");
  const db = requireDb(c.env);
  if (user.role === "Reader") {
    const stats = await db.prepare(`
      SELECT
        COUNT(*) AS total_borrowings,
        SUM(CASE WHEN status = 'borrowed' THEN 1 ELSE 0 END) AS active_borrowings,
        SUM(CASE WHEN status = 'borrowed' AND due_at < ? THEN 1 ELSE 0 END) AS overdue_borrowings,
        SUM(CASE WHEN status = 'returned' THEN 1 ELSE 0 END) AS returned_borrowings
      FROM borrowings WHERE reader_id = ?
    `).bind(new Date().toISOString(), user.readerId).first();
    return successResponse(c, {
      role: "Reader",
      totalBorrowings: stats.total_borrowings || 0,
      activeBorrowings: stats.active_borrowings || 0,
      overdueBorrowings: stats.overdue_borrowings || 0,
      returnedBorrowings: stats.returned_borrowings || 0,
    });
  }
  if (!staffRoles.includes(user.role)) {
    throw new ApiError(403, "FORBIDDEN", "Your role is not allowed to view statistics.");
  }

  const now = new Date().toISOString();
  const [bookStats, readerStats, borrowingStats, recentBorrowings] = await Promise.all([
    db.prepare(`
      SELECT COUNT(*) AS titles, COALESCE(SUM(total_copies), 0) AS total_copies,
        COALESCE(SUM(available_copies), 0) AS available_copies
      FROM books WHERE is_active = 1
    `).first(),
    db.prepare("SELECT COUNT(*) AS total FROM readers WHERE status = 'active'").first(),
    db.prepare(`
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN status = 'borrowed' THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status = 'borrowed' AND due_at < ? THEN 1 ELSE 0 END) AS overdue,
        SUM(CASE WHEN status = 'returned' THEN 1 ELSE 0 END) AS returned
      FROM borrowings
    `).bind(now).first(),
    db.prepare("SELECT COUNT(*) AS total FROM borrowings WHERE borrowed_at >= datetime('now', '-30 days')").first(),
  ]);
  return successResponse(c, {
    role: user.role,
    books: {
      titles: bookStats.titles,
      totalCopies: bookStats.total_copies,
      availableCopies: bookStats.available_copies,
    },
    activeReaders: readerStats.total,
    borrowings: {
      total: borrowingStats.total,
      active: borrowingStats.active || 0,
      overdue: borrowingStats.overdue || 0,
      returned: borrowingStats.returned || 0,
      last30Days: recentBorrowings.total,
    },
  });
});

statistics.get("/borrowings", async (c) => {
  const user = c.get("auth");
  if (user.role !== "Reader" && !staffRoles.includes(user.role)) {
    throw new ApiError(403, "FORBIDDEN", "Your role is not allowed to view statistics.");
  }
  const days = daysQuery(c);
  const readerFilter = user.role === "Reader" ? "AND reader_id = ?" : "";
  const parameters = user.role === "Reader" ? [days, user.readerId] : [days];
  const rows = await requireDb(c.env).prepare(`
    SELECT date(borrowed_at) AS date, COUNT(*) AS total
    FROM borrowings
    WHERE borrowed_at >= datetime('now', '-' || ? || ' days') ${readerFilter}
    GROUP BY date(borrowed_at)
    ORDER BY date(borrowed_at)
  `).bind(...parameters).all();
  return successResponse(c, { days, items: rows.results });
});

statistics.get("/categories", requireRoles(...staffRoles), async (c) => {
  const rows = await requireDb(c.env).prepare(`
    SELECT categories.id, categories.name AS category, COUNT(books.id) AS titles,
      COALESCE(SUM(books.total_copies), 0) AS copies,
      COALESCE(SUM(books.available_copies), 0) AS availableCopies
    FROM categories
    LEFT JOIN books ON books.category_id = categories.id AND books.is_active = 1
    GROUP BY categories.id
    ORDER BY titles DESC, categories.name
  `).all();
  return successResponse(c, { items: rows.results });
});

export default statistics;
