import { Hono } from "hono";
import { ApiError, optionalText, pagination, readJsonObject, requiredText, successResponse } from "../lib/errors.js";
import { requireDb } from "../lib/db.js";
import { forwardImageToAiService, forwardToAiService } from "../lib/ai-service.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";

const ai = new Hono();
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const CLASS_NAMES = new Set([
  "Công nghệ thông tin",
  "Toán học",
  "Khoa học",
  "Ngoại ngữ",
  "Kinh tế",
  "Văn học",
]);

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
        ai_classifications.model, ai_classifications.created_at, categories.name AS category,
        predicted_categories.name AS predicted_category, ai_classifications.review_status,
        ai_classifications.reviewed_by, ai_classifications.reviewed_at
      FROM ai_classifications
      LEFT JOIN categories ON categories.id = ai_classifications.category_id
      LEFT JOIN categories AS predicted_categories
        ON predicted_categories.id = ai_classifications.predicted_category_id
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
      predictedCategory: row.predicted_category,
      result: JSON.parse(row.result_json),
      model: row.model,
      reviewStatus: row.review_status,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
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
      id, book_id, requested_by, category_id, predicted_category_id,
      title, author, description, result_json, model, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, bookId, c.get("auth").id, categoryId, categoryId,
    title, author, description, resultJson, model, createdAt,
  ).run();
  return successResponse(c, { id, bookId, categoryId, result, createdAt }, 201);
});

function validatePrediction(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)
    || !CLASS_NAMES.has(result.category)
    || typeof result.confidence !== "number"
    || !Number.isFinite(result.confidence)
    || result.confidence < 0
    || result.confidence > 1
    || typeof result.model !== "string"
    || !result.model.trim()
    || !Array.isArray(result.top3)
    || result.top3.length !== 3) {
    throw new ApiError(502, "AI_INVALID_RESPONSE", "The AI service returned an invalid image classification.");
  }
  const labels = new Set();
  for (const item of result.top3) {
    if (!item || !CLASS_NAMES.has(item.category)
      || labels.has(item.category)
      || typeof item.confidence !== "number"
      || !Number.isFinite(item.confidence)
      || item.confidence < 0
      || item.confidence > 1) {
      throw new ApiError(502, "AI_INVALID_RESPONSE", "The AI service returned invalid top-three predictions.");
    }
    labels.add(item.category);
  }
  if (result.top3[0].category !== result.category
    || Math.abs(result.top3[0].confidence - result.confidence) > 0.00001
    || result.top3.some((item, index) => index > 0 && item.confidence > result.top3[index - 1].confidence)) {
    throw new ApiError(502, "AI_INVALID_RESPONSE", "The AI service returned inconsistent image classification scores.");
  }
}

ai.post("/classify-cover", async (c) => {
  const contentType = c.req.header("content-type") || "";
  if (!/^multipart\/form-data(?:\s*;|$)/i.test(contentType)) {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Cover classification requires multipart/form-data.");
  }
  const contentLength = Number(c.req.header("content-length") || 0);
  if (contentLength > MAX_IMAGE_SIZE + 65536) {
    throw new ApiError(413, "COVER_TOO_LARGE", "Book cover images must be at most 5 MiB.");
  }

  let form;
  try {
    form = await c.req.formData();
  } catch {
    throw new ApiError(400, "INVALID_MULTIPART", "The uploaded form data is invalid.");
  }
  const files = form.getAll("file");
  if (files.length > 1 || (files.length === 1 && (typeof files[0] === "string" || !files[0]))) {
    throw new ApiError(400, "INVALID_COVER", "Upload at most one image file in the file field.");
  }
  const file = files[0] || null;
  if (file && (file.size < 1 || file.size > MAX_IMAGE_SIZE)) {
    throw new ApiError(file.size > MAX_IMAGE_SIZE ? 413 : 400, "INVALID_COVER", "The cover must be between 1 byte and 5 MiB.");
  }
  if (file && !IMAGE_TYPES.has(file.type)) {
    throw new ApiError(415, "UNSUPPORTED_COVER_FORMAT", "Only JPEG, PNG, and WebP images are supported.");
  }

  const rawBookId = form.get("bookId");
  const bookId = rawBookId === null ? "" : requiredText(rawBookId, "bookId", { max: 100 });
  const db = requireDb(c.env);
  let book = null;
  if (bookId) {
    book = await db.prepare(`
      SELECT id, title, author, description, cover_object_key, cover_content_type
      FROM books WHERE id = ? AND is_active = 1
    `).bind(bookId).first();
    if (!book) throw new ApiError(404, "BOOK_NOT_FOUND", "An active book with this ID was not found.");
  }

  const rawTitle = form.get("title");
  const title = book
    ? book.title
    : rawTitle === null ? "" : requiredText(rawTitle, "title", { max: 200 });
  if (!title) throw new ApiError(400, "VALIDATION_ERROR", "Select a book or provide a title.");
  const rawAuthor = form.get("author");
  const rawDescription = form.get("description");
  const author = book
    ? book.author
    : optionalText(rawAuthor, "author", { max: 160 });
  const description = book
    ? book.description
    : optionalText(rawDescription, "description", { max: 4000 });

  let imageBytes;
  let imageType;
  if (file) {
    imageBytes = await file.arrayBuffer();
    imageType = file.type;
  } else {
    if (!book?.cover_object_key) {
      throw new ApiError(400, "COVER_REQUIRED", "Upload an image or select a book with an uploaded cover.");
    }
    if (!c.env.BOOK_COVERS) {
      throw new ApiError(503, "R2_NOT_CONFIGURED", "The book cover storage is not configured.");
    }
    const image = await c.env.BOOK_COVERS.get(book.cover_object_key);
    if (!image) throw new ApiError(404, "COVER_NOT_FOUND", "The uploaded book cover was not found.");
    if (image.size > MAX_IMAGE_SIZE) {
      throw new ApiError(413, "COVER_TOO_LARGE", "Book cover images must be at most 5 MiB.");
    }
    imageBytes = await image.arrayBuffer();
    imageType = book.cover_content_type;
  }
  if (!IMAGE_TYPES.has(imageType)) {
    throw new ApiError(415, "UNSUPPORTED_COVER_FORMAT", "Only JPEG, PNG, and WebP images are supported.");
  }

  const result = await forwardImageToAiService(c, "predict", imageBytes, imageType, {
    title,
    author,
    description,
  });
  validatePrediction(result);

  const predictedCategory = await db.prepare("SELECT id FROM categories WHERE name = ?")
    .bind(result.category).first();
  if (!predictedCategory) {
    throw new ApiError(503, "AI_CATEGORIES_NOT_CONFIGURED", "The book classification categories have not been initialized.");
  }
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const resultJson = JSON.stringify(result);
  await db.prepare(`
    INSERT INTO ai_classifications (
      id, book_id, requested_by, category_id, predicted_category_id,
      title, author, description, result_json, model, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, bookId || null, c.get("auth").id, predictedCategory.id, predictedCategory.id,
    title, author, description, resultJson, result.model.slice(0, 120), createdAt,
  ).run();
  return successResponse(c, {
    id,
    bookId: bookId || null,
    categoryId: predictedCategory.id,
    result,
    reviewStatus: "pending",
    createdAt,
  }, 201);
});

ai.patch("/classifications/:id/review", async (c) => {
  const body = await readJsonObject(c);
  if (Object.hasOwn(body, "category") === Object.hasOwn(body, "categoryId")) {
    throw new ApiError(400, "VALIDATION_ERROR", "Provide exactly one of category or categoryId.");
  }
  const db = requireDb(c.env);
  const classification = await db.prepare(`
    SELECT id, book_id, predicted_category_id
    FROM ai_classifications WHERE id = ?
  `).bind(c.req.param("id")).first();
  if (!classification) throw new ApiError(404, "CLASSIFICATION_NOT_FOUND", "Classification was not found.");

  const category = Object.hasOwn(body, "categoryId")
    ? await db.prepare("SELECT id, name FROM categories WHERE id = ?")
      .bind(requiredText(body.categoryId, "categoryId", { max: 100 })).first()
    : await db.prepare("SELECT id, name FROM categories WHERE name = ?")
      .bind(requiredText(body.category, "category", { max: 80 })).first();
  if (!category || !CLASS_NAMES.has(category.name)) {
    throw new ApiError(400, "INVALID_CATEGORY", "Select one of the six book classification categories.");
  }

  const reviewStatus = category.id === classification.predicted_category_id ? "confirmed" : "corrected";
  const reviewedAt = new Date().toISOString();
  const statements = [
    db.prepare(`
      UPDATE ai_classifications
      SET category_id = ?, review_status = ?, reviewed_by = ?, reviewed_at = ?
      WHERE id = ?
    `).bind(category.id, reviewStatus, c.get("auth").id, reviewedAt, classification.id),
  ];
  if (classification.book_id) {
    statements.push(db.prepare(`
      UPDATE books SET category_id = ?, updated_at = ?
      WHERE id = ? AND is_active = 1
    `).bind(category.id, reviewedAt, classification.book_id));
  }
  const results = await db.batch(statements);
  if (results[0]?.meta.changes !== 1) {
    throw new ApiError(409, "CLASSIFICATION_REVIEW_CONFLICT", "The classification changed while it was being reviewed.");
  }

  return successResponse(c, {
    id: classification.id,
    categoryId: category.id,
    category: category.name,
    predictedCategoryId: classification.predicted_category_id,
    reviewStatus,
    reviewedBy: c.get("auth").id,
    reviewedAt,
  });
});

export default ai;
