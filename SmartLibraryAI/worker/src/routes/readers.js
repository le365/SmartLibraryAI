import { Hono } from "hono";
import { ApiError, pagination, readJsonObject, optionalText, requiredText, successResponse, validEmail } from "../lib/errors.js";
import { requireDb } from "../lib/db.js";
import { hashPassword, randomHex } from "../lib/crypto.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";

const readers = new Hono();
const staffRoles = ["Admin", "Librarian"];

function mapReader(reader) {
  return {
    id: reader.id,
    readerCode: reader.reader_code,
    userId: reader.user_id,
    name: reader.name,
    email: reader.email,
    phone: reader.phone,
    status: reader.status,
    borrowed: reader.borrowed_count || 0,
    createdAt: reader.created_at,
  };
}

readers.use("*", requireAuth);

readers.post("/", requireRoles(...staffRoles), async (c) => {
  const body = await readJsonObject(c);
  const name = requiredText(body.name, "name", { min: 2, max: 100 });
  const email = requiredText(body.email, "email", { max: 254 }).toLowerCase();
  if (!validEmail(email)) throw new ApiError(400, "VALIDATION_ERROR", "email must be a valid email address.");
  if (typeof body.password !== "string" || body.password.length < 10 || body.password.length > 128) {
    throw new ApiError(400, "VALIDATION_ERROR", "password must contain 10-128 characters.");
  }
  const phone = body.phone === undefined || body.phone === null
    ? null
    : optionalText(body.phone, "phone", { max: 30 }) || null;
  const db = requireDb(c.env);
  const now = new Date().toISOString();
  const userId = crypto.randomUUID();
  const readerId = crypto.randomUUID();
  const readerCode = `R-${randomHex(5).toUpperCase()}`;
  const { salt, hash } = await hashPassword(body.password);
  const results = await db.batch([
    db.prepare(`
      INSERT INTO users (id, email, name, password_hash, password_salt, role, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'Reader', 'active', ?, ?)
      ON CONFLICT(email) DO NOTHING
    `).bind(userId, email, name, hash, salt, now, now),
    db.prepare(`
      INSERT INTO readers (id, user_id, reader_code, phone, status, created_at)
      SELECT ?, ?, ?, ?, 'active', ?
      WHERE changes() = 1 AND EXISTS (SELECT 1 FROM users WHERE id = ?)
    `).bind(readerId, userId, readerCode, phone, now, userId),
  ]);
  if (results[0].meta.changes !== 1) {
    throw new ApiError(409, "EMAIL_ALREADY_REGISTERED", "An account with this email already exists.");
  }
  if (results[1].meta.changes !== 1) {
    throw new ApiError(500, "READER_CREATE_FAILED", "Could not create the reader profile.");
  }
  return successResponse(c, {
    reader: { id: readerId, readerCode, userId, name, email, phone, status: "active", borrowed: 0, createdAt: now },
  }, 201);
});

readers.get("/me", async (c) => {
  const user = c.get("auth");
  if (!user.readerId) throw new ApiError(404, "READER_NOT_FOUND", "No reader profile is associated with this account.");
  const reader = await requireDb(c.env).prepare(`
    SELECT readers.id, readers.reader_code, readers.user_id, users.name, users.email,
      readers.phone, readers.status, readers.created_at,
      (SELECT COUNT(*) FROM borrowings WHERE reader_id = readers.id AND status = 'borrowed') AS borrowed_count
    FROM readers JOIN users ON users.id = readers.user_id
    WHERE readers.id = ?
  `).bind(user.readerId).first();
  if (!reader) throw new ApiError(404, "READER_NOT_FOUND", "Reader profile was not found.");
  return successResponse(c, { reader: mapReader(reader) });
});

readers.get("/", requireRoles(...staffRoles), async (c) => {
  const db = requireDb(c.env);
  const { limit, offset } = pagination(c);
  const search = (c.req.query("search") || "").trim().slice(0, 100);
  const status = c.req.query("status");
  if (status && !["active", "suspended"].includes(status)) {
    throw new ApiError(400, "VALIDATION_ERROR", "status must be active or suspended.");
  }
  const conditions = [];
  const values = [];
  if (search) {
    conditions.push("(users.name LIKE ? OR users.email LIKE ? OR readers.reader_code LIKE ?)");
    const pattern = `%${search}%`;
    values.push(pattern, pattern, pattern);
  }
  if (status) {
    conditions.push("readers.status = ?");
    values.push(status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [rows, count] = await Promise.all([
    db.prepare(`
      SELECT readers.id, readers.reader_code, readers.user_id, users.name, users.email,
        readers.phone, readers.status, readers.created_at,
        (SELECT COUNT(*) FROM borrowings WHERE reader_id = readers.id AND status = 'borrowed') AS borrowed_count
      FROM readers JOIN users ON users.id = readers.user_id
      ${where}
      ORDER BY readers.created_at DESC LIMIT ? OFFSET ?
    `).bind(...values, limit, offset).all(),
    db.prepare(`
      SELECT COUNT(*) AS total
      FROM readers JOIN users ON users.id = readers.user_id ${where}
    `).bind(...values).first(),
  ]);
  return successResponse(c, { items: rows.results.map(mapReader), pagination: { limit, offset, total: count.total } });
});

readers.get("/:id", async (c) => {
  const user = c.get("auth");
  const id = c.req.param("id");
  if (user.role === "Reader" && user.readerId !== id) {
    throw new ApiError(404, "READER_NOT_FOUND", "Reader profile was not found.");
  }
  if (user.role !== "Reader" && !staffRoles.includes(user.role)) {
    throw new ApiError(403, "FORBIDDEN", "Your role is not allowed to view reader profiles.");
  }
  const reader = await requireDb(c.env).prepare(`
    SELECT readers.id, readers.reader_code, readers.user_id, users.name, users.email,
      readers.phone, readers.status, readers.created_at,
      (SELECT COUNT(*) FROM borrowings WHERE reader_id = readers.id AND status = 'borrowed') AS borrowed_count
    FROM readers JOIN users ON users.id = readers.user_id WHERE readers.id = ?
  `).bind(id).first();
  if (!reader) throw new ApiError(404, "READER_NOT_FOUND", "Reader profile was not found.");
  return successResponse(c, { reader: mapReader(reader) });
});

readers.patch("/:id", requireRoles(...staffRoles), async (c) => {
  const body = await readJsonObject(c);
  const db = requireDb(c.env);
  const readerId = c.req.param("id");
  const reader = await db.prepare("SELECT user_id FROM readers WHERE id = ?").bind(readerId).first();
  if (!reader) throw new ApiError(404, "READER_NOT_FOUND", "Reader profile was not found.");

  const changes = [];
  const values = [];
  if (Object.hasOwn(body, "phone")) {
    changes.push("phone = ?");
    values.push(body.phone === null ? null : optionalText(body.phone, "phone", { max: 30 }) || null);
  }
  if (Object.hasOwn(body, "status")) {
    if (!["active", "suspended"].includes(body.status)) {
      throw new ApiError(400, "VALIDATION_ERROR", "status must be active or suspended.");
    }
    changes.push("status = ?");
    values.push(body.status);
  }
  if (Object.hasOwn(body, "name")) {
    requiredText(body.name, "name", { min: 2, max: 100 });
  }
  if (!changes.length && !Object.hasOwn(body, "name")) {
    throw new ApiError(400, "VALIDATION_ERROR", "Provide phone, name, or status to update.");
  }

  const statements = [];
  if (Object.hasOwn(body, "name")) {
    statements.push(db.prepare("UPDATE users SET name = ?, updated_at = ? WHERE id = ?")
      .bind(body.name.trim(), new Date().toISOString(), reader.user_id));
  }
  if (changes.length) {
    values.push(readerId);
    statements.push(db.prepare(`UPDATE readers SET ${changes.join(", ")} WHERE id = ?`).bind(...values));
  }
  const results = await db.batch(statements);
  if (results.some((result) => result.meta.changes !== 1)) {
    throw new ApiError(404, "READER_NOT_FOUND", "Reader profile was not found.");
  }
  const updated = await db.prepare(`
    SELECT readers.id, readers.reader_code, readers.user_id, users.name, users.email,
      readers.phone, readers.status, readers.created_at,
      (SELECT COUNT(*) FROM borrowings WHERE reader_id = readers.id AND status = 'borrowed') AS borrowed_count
    FROM readers JOIN users ON users.id = readers.user_id WHERE readers.id = ?
  `).bind(readerId).first();
  return successResponse(c, { reader: mapReader(updated) });
});

readers.delete("/:id", requireRoles("Admin"), async (c) => {
  const db = requireDb(c.env);
  const reader = await db.prepare("SELECT user_id FROM readers WHERE id = ?").bind(c.req.param("id")).first();
  if (!reader) throw new ApiError(404, "READER_NOT_FOUND", "Reader profile was not found.");
  const activeBorrowings = await db.prepare(`
    SELECT COUNT(*) AS total FROM borrowings WHERE reader_id = ? AND status = 'borrowed'
  `).bind(c.req.param("id")).first();
  if (activeBorrowings.total > 0) {
    throw new ApiError(409, "READER_HAS_ACTIVE_BORROWINGS", "Return all active books before suspending this reader.");
  }
  await db.batch([
    db.prepare("UPDATE readers SET status = 'suspended' WHERE id = ?").bind(c.req.param("id")),
    db.prepare("UPDATE users SET status = 'inactive', updated_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), reader.user_id),
    db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(reader.user_id),
  ]);
  return successResponse(c, { id: c.req.param("id"), suspended: true });
});

export default readers;
