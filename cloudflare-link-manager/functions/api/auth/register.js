import {
  ensureSessionSecret,
  hashPassword,
  sessionCookie,
} from "../../_shared/auth.js";
import {
  errorResponse,
  HttpError,
  json,
  readJson,
  requireObject,
} from "../../_shared/http.js";

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB) throw new Error("D1 binding DB is not configured.");
    ensureSessionSecret(env);

    const body = requireObject(await readJson(request));
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!/^[a-z0-9_.-]{3,32}$/.test(username)) {
      throw new HttpError(400, "INVALID_USERNAME", "Tên người dùng phải có 3–32 ký tự hợp lệ.");
    }
    if (
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      throw new HttpError(400, "INVALID_EMAIL", "Địa chỉ email không hợp lệ.");
    }
    if (password.length < 10 || password.length > 128) {
      throw new HttpError(400, "INVALID_PASSWORD", "Mật khẩu phải có 10–128 ký tự.");
    }

    const passwordHash = await hashPassword(password);
    const inserted = await env.DB.prepare(
      `INSERT INTO users (username, email, password_hash)
       VALUES (?, ?, ?)
       ON CONFLICT DO NOTHING`,
    )
      .bind(username, email, passwordHash)
      .run();

    if (inserted.meta?.changes !== 1) {
      throw new HttpError(409, "ACCOUNT_EXISTS", "Tên người dùng hoặc email đã được sử dụng.");
    }

    const user = await env.DB.prepare(
      "SELECT id, username, email FROM users WHERE username = ?",
    )
      .bind(username)
      .first();
    if (!user) throw new Error("User insert succeeded but the new row could not be loaded.");

    return json(
      { user },
      201,
      { "set-cookie": await sessionCookie(request, user.id, env) },
    );
  } catch (error) {
    return errorResponse(error, "auth/register");
  }
}
