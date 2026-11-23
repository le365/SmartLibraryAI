import { createMiddleware } from "hono/factory";
import { ApiError } from "../lib/errors.js";
import { requireDb } from "../lib/db.js";
import { sha256Hex } from "../lib/crypto.js";

const SESSION_COOKIE = "smartlibrary_session";

function readCookie(request, name) {
  const cookieHeader = request.headers.get("cookie") || "";
  const item = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return item ? item.slice(name.length + 1) : "";
}

export async function setSessionCookie(c, token, maxAgeSeconds) {
  const sameSite = c.env.APP_ENV === "development" ? "Lax" : "None";
  const secure = c.env.APP_ENV === "development" ? "" : "; Secure";
  c.header(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=${sameSite}; Max-Age=${maxAgeSeconds}${secure}`,
    { append: true },
  );
}

export function clearSessionCookie(c) {
  const sameSite = c.env.APP_ENV === "development" ? "Lax" : "None";
  const secure = c.env.APP_ENV === "development" ? "" : "; Secure";
  c.header(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=${sameSite}; Max-Age=0${secure}`,
    { append: true },
  );
}

export async function revokeCurrentSession(c) {
  const token = readCookie(c.req.raw, SESSION_COOKIE);
  if (!token) return;
  const db = requireDb(c.env);
  await db.prepare("DELETE FROM sessions WHERE token_hash = ?")
    .bind(await sha256Hex(token))
    .run();
}

export const requireAuth = createMiddleware(async (c, next) => {
  const token = readCookie(c.req.raw, SESSION_COOKIE);
  if (!token) throw new ApiError(401, "AUTHENTICATION_REQUIRED", "Please sign in to access this resource.");

  const db = requireDb(c.env);
  const tokenHash = await sha256Hex(token);
  const now = new Date().toISOString();
  const user = await db.prepare(`
    SELECT
      users.id, users.email, users.name, users.role, users.status,
      readers.id AS reader_id, readers.status AS reader_status,
      sessions.expires_at
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    LEFT JOIN readers ON readers.user_id = users.id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
    LIMIT 1
  `).bind(tokenHash, now).first();

  if (!user || user.status !== "active") {
    throw new ApiError(401, "INVALID_SESSION", "Your session is invalid or has expired.");
  }
  if (user.role === "Reader" && user.reader_status !== "active") {
    throw new ApiError(403, "ACCOUNT_RESTRICTED", "This reader account is not active.");
  }

  c.set("auth", {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    readerId: user.reader_id,
  });
  await next();
});

export function requireRoles(...roles) {
  return createMiddleware(async (c, next) => {
    const user = c.get("auth");
    if (!user || !roles.includes(user.role)) {
      throw new ApiError(403, "FORBIDDEN", "Your role is not allowed to perform this action.");
    }
    await next();
  });
}
