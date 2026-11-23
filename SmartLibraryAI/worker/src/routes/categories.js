import { Hono } from "hono";
import { ApiError, optionalText, pagination, readJsonObject, requiredText, successResponse } from "../lib/errors.js";
import { requireDb } from "../lib/db.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";

const categories = new Hono();

categories.use("*", requireAuth);

categories.get("/", async (c) => {
  const db = requireDb(c.env);
  const { limit, offset } = pagination(c);
  const [rows, count] = await Promise.all([
    db.prepare(`
      SELECT categories.id, categories.name, categories.description, categories.created_at,
        COUNT(books.id) AS book_count
      FROM categories LEFT JOIN books ON books.category_id = categories.id AND books.is_active = 1
      GROUP BY categories.id
      ORDER BY categories.name COLLATE NOCASE LIMIT ? OFFSET ?
    `).bind(limit, offset).all(),
    db.prepare("SELECT COUNT(*) AS total FROM categories").first(),
  ]);
  return successResponse(c, {
    items: rows.results.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      bookCount: row.book_count,
      createdAt: row.created_at,
    })),
    pagination: { limit, offset, total: count.total },
  });
});

categories.post("/", requireRoles("Admin", "Librarian"), async (c) => {
  const body = await readJsonObject(c);
  const name = requiredText(body.name, "name", { max: 80 });
  const description = optionalText(body.description, "description", { max: 500 });
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await requireDb(c.env).prepare(`
      INSERT INTO categories (id, name, description, created_at) VALUES (?, ?, ?, ?)
    `).bind(id, name, description, now).run();
  } catch (error) {
    if (/unique|constraint/i.test(error.message)) {
      throw new ApiError(409, "CATEGORY_ALREADY_EXISTS", "A category with this name already exists.");
    }
    throw error;
  }
  return successResponse(c, { category: { id, name, description, createdAt: now } }, 201);
});

export default categories;
