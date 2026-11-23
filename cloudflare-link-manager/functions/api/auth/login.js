import {
  ensureSessionSecret,
  sessionCookie,
  verifyPassword,
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
    const identifier =
      typeof body.identifier === "string" ? body.identifier.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!identifier || identifier.length > 254 || !password || password.length > 128) {
      throw new HttpError(400, "INVALID_CREDENTIALS", "Thông tin đăng nhập không hợp lệ.");
    }

    const user = await env.DB.prepare(
      `SELECT id, username, email, password_hash
       FROM users
       WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE
       LIMIT 1`,
    )
      .bind(identifier, identifier)
      .first();

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Email/tên người dùng hoặc mật khẩu không đúng.");
    }

    return json(
      { user: { id: user.id, username: user.username, email: user.email } },
      200,
      { "set-cookie": await sessionCookie(request, user.id, env) },
    );
  } catch (error) {
    return errorResponse(error, "auth/login");
  }
}
