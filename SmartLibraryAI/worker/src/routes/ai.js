import { Hono } from "hono";
import { ApiError, optionalText, pagination, readJsonObject, requiredText, successResponse } from "../lib/errors.js";
import { requireDb } from "../lib/db.js";
import { forwardToAiService } from "../lib/ai-service.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";

const ai = new Hono();

ai.use("*", requireAuth, requireRoles("Admin", "Librarian"));

ai.get("/classifications", async (c) => {
  const db = requireDb(c.env);
  const { limit, offset } = pagination(c);
  const bookId = c.req.query("bookId");
  const where = bookId ? "WHERE ai_classifications.book_id = ?" : "";
  const parameters = bookId ? [bookId] : [];
  const [rows, count] = await Promise.all([
    db.prepare(`
      SELECT ai_classifications.id, ai_classifications.book_id, ai_classifications.title,
        ai_classifications.author, ai_classifications.description, ai_classifications.result_json,
        ai_classifications.model, ai_classifications.created_at, categories.name AS category
      FROM ai_classifications
      LEFT JOIN categories ON categories.id = ai_classifications.category_id
      ${where}
      ORDER BY ai_classifications.created_at DESC LIMIT ? OFFSET ?
    `).bind(...parameters, limit, offset).all(),
    db.prepare(`SELECT COUNT(*) AS total FROM ai_classifications ${where}`).bind(...parameters).first(),
  ]);
  return successResponse(c, {
    items: rows.results.map((row) => ({
      id: row.id,
      bookId: row.book_id,
      title: row.title,
      author: row.author,
      description: row.description,
      category: row.category,
      result: JSON.parse(row.result_json),
      model: row.model,
      createdAt: row.created_at,
    })),
    pagination: { limit, offset, total: count.total },
  });
});

ai.post("/classify", async (c) => {
  const body = await readJsonObject(c);
  const title = requiredText(body.title, "title", { max: 200 });
  const author = optionalText(body.author, "author", { max: 160 });
  const description = optionalText(body.description, "description", { max: 4000 });
  let bookId = null;
  if (body.bookId !== undefined) {
    bookId = requiredText(body.bookId, "bookId", { max: 100 });
    const book = await requireDb(c.env).prepare("SELECT id FROM books WHERE id = ? AND is_active = 1")
      .bind(bookId).first();
    if (!book) throw new ApiError(404, "BOOK_NOT_FOUND", "An active book with this ID was not found.");
  }
  if (!description && !author) {
    throw new ApiError(400, "VALIDATION_ERROR", "Provide at least an author or description for classification.");
  }
  const result = await forwardToAiService(c, "classify", { title, author, description });
  const resultJson = JSON.stringify(result);
  const model = typeof result.model === "string" ? result.model.slice(0, 120) : null;
  let categoryId = null;
  if (typeof result.category === "string" && result.category.trim()) {
    const category = await requireDb(c.env).prepare("SELECT id FROM categories WHERE name = ?")
      .bind(result.category.trim().slice(0, 80)).first();
    categoryId = category?.id || null;
  }
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await requireDb(c.env).prepare(`
    INSERT INTO ai_classifications (
      id, book_id, requested_by, category_id, title, author, description, result_json, model, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, bookId, c.get("auth").id, categoryId, title, author, description, resultJson, model, createdAt,
  ).run();
  return successResponse(c, { id, bookId, categoryId, result, createdAt }, 201);
});

export default ai;
