import { Hono } from "hono";
import { ApiError, readJsonObject, requiredText, successResponse, validEmail } from "../lib/errors.js";
import { requireDb } from "../lib/db.js";
import { constantTimeEqual, hashPassword, randomHex, sha256Hex } from "../lib/crypto.js";
import { clearSessionCookie, requireAuth, revokeCurrentSession, setSessionCookie } from "../middleware/auth.js";

const SESSION_DAYS = 7;
const SESSION_SECONDS = SESSION_DAYS * 24 * 60 * 60;
const DUMMY_SALT = "00000000000000000000000000000000";
const auth = new Hono();

function userProfile(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    readerId: user.reader_id || null,
  };
}

async function createSession(c, db, user) {
  const token = randomHex(32);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_SECONDS * 1000).toISOString();
  await db.prepare(`
    INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).bind(await sha256Hex(token), user.id, expiresAt, now.toISOString()).run();
  await setSessionCookie(c, token, SESSION_SECONDS);
  return userProfile(user);
}

auth.post("/register", async (c) => {
  const body = await readJsonObject(c);
  const name = requiredText(body.name, "name", { min: 2, max: 100 });
  const email = requiredText(body.email, "email", { max: 254 }).toLowerCase();
  if (!validEmail(email)) throw new ApiError(400, "VALIDATION_ERROR", "email must be a valid email address.");
  if (typeof body.password !== "string" || body.password.length < 10 || body.password.length > 128) {
    throw new ApiError(400, "VALIDATION_ERROR", "password must contain 10-128 characters.");
  }

  const db = requireDb(c.env);
  const now = new Date().toISOString();
  const userId = crypto.randomUUID();
  const readerId = crypto.randomUUID();
  const readerCode = `R-${randomHex(5).toUpperCase()}`;
  const sessionToken = randomHex(32);
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  const { salt, hash } = await hashPassword(body.password);

  const results = await db.batch([
    db.prepare(`
      INSERT INTO users (id, email, name, password_hash, password_salt, role, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'Reader', 'active', ?, ?)
      ON CONFLICT(email) DO NOTHING
    `).bind(userId, email, name, hash, salt, now, now),
    db.prepare(`
      INSERT INTO readers (id, user_id, reader_code, status, created_at)
      SELECT ?, ?, ?, 'active', ?
      WHERE changes() = 1 AND EXISTS (SELECT 1 FROM users WHERE id = ?)
    `).bind(readerId, userId, readerCode, now, userId),
    db.prepare(`
      INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
      SELECT ?, ?, ?, ?
      WHERE changes() = 1 AND EXISTS (SELECT 1 FROM readers WHERE id = ? AND user_id = ?)
    `).bind(await sha256Hex(sessionToken), userId, expiresAt, now, readerId, userId),
  ]);

  if (results[0].meta.changes !== 1) {
    throw new ApiError(409, "EMAIL_ALREADY_REGISTERED", "An account with this email already exists.");
  }
  if (results[1].meta.changes !== 1 || results[2].meta.changes !== 1) {
    throw new ApiError(500, "REGISTRATION_FAILED", "Could not create the reader profile and session.");
  }

  const user = { id: userId, email, name, role: "Reader", reader_id: readerId };
  await setSessionCookie(c, sessionToken, SESSION_SECONDS);
  return successResponse(c, { user: userProfile(user) }, 201);
});

auth.post("/login", async (c) => {
  const body = await readJsonObject(c);
  const email = requiredText(body.email, "email", { max: 254 }).toLowerCase();
  if (!validEmail(email)) throw new ApiError(400, "VALIDATION_ERROR", "email must be a valid email address.");
  if (typeof body.password !== "string" || body.password.length < 1 || body.password.length > 128) {
    throw new ApiError(400, "VALIDATION_ERROR", "password must contain 1-128 characters.");
  }

  const db = requireDb(c.env);
  const user = await db.prepare(`
    SELECT users.id, users.email, users.name, users.role, users.status,
      users.password_hash, users.password_salt,
      readers.id AS reader_id, readers.status AS reader_status
    FROM users
    LEFT JOIN readers ON readers.user_id = users.id
    WHERE users.email = ?
    LIMIT 1
  `).bind(email).first();
  const passwordSalt = user?.password_salt || DUMMY_SALT;
  const { hash } = await hashPassword(body.password, passwordSalt);
  if (!user || !constantTimeEqual(hash, user.password_hash) || user.status !== "active") {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  }
  if (user.role === "Reader" && user.reader_status !== "active") {
    throw new ApiError(403, "ACCOUNT_RESTRICTED", "This reader account is not active.");
  }

  await db.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(new Date().toISOString()).run();
  const profile = await createSession(c, db, user);
  return successResponse(c, { user: profile });
});

auth.post("/logout", async (c) => {
  await readJsonObject(c);
  await revokeCurrentSession(c);
  clearSessionCookie(c);
  return successResponse(c, { loggedOut: true });
});

auth.get("/me", requireAuth, async (c) => {
  return successResponse(c, { user: c.get("auth") });
});

export default auth;
