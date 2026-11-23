import { ApiError, requiredText } from "./errors.js";

export async function resolveCategory(db, { categoryId, categoryName, defaultName }) {
  if (categoryId !== undefined && categoryName !== undefined) {
    throw new ApiError(400, "VALIDATION_ERROR", "Provide categoryId or category, not both.");
  }

  if (categoryId !== undefined) {
    const id = requiredText(categoryId, "categoryId", { max: 100 });
    const category = await db.prepare("SELECT id, name FROM categories WHERE id = ?").bind(id).first();
    if (!category) throw new ApiError(400, "INVALID_CATEGORY", "The selected category does not exist.");
    return category;
  }

  const name = requiredText(categoryName ?? defaultName, "category", { max: 80 });
  const now = new Date().toISOString();
  await db.prepare(`
    INSERT INTO categories (id, name, created_at)
    VALUES (?, ?, ?)
    ON CONFLICT(name) DO NOTHING
  `).bind(crypto.randomUUID(), name, now).run();
  const category = await db.prepare("SELECT id, name FROM categories WHERE name = ?").bind(name).first();
  if (!category) throw new ApiError(500, "CATEGORY_CREATE_FAILED", "Could not resolve the book category.");
  return category;
}
