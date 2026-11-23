import { requireUserId } from "../../_shared/auth.js";
import { errorResponse, HttpError, json } from "../../_shared/http.js";

export async function onRequestGet({ request, env }) {
  try {
    const userId = await requireUserId(request, env);
    const user = await env.DB.prepare(
      "SELECT id, username, email FROM users WHERE id = ?",
    )
      .bind(userId)
      .first();
    if (!user) throw new HttpError(401, "UNAUTHORIZED", "Vui lòng đăng nhập lại.");
    return json({ user });
  } catch (error) {
    return errorResponse(error, "auth/me");
  }
}
