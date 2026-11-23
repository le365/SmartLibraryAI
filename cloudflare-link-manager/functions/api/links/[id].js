import { requireUserId } from "../../_shared/auth.js";
import {
  errorResponse,
  HttpError,
  json,
  parseId,
  readJson,
  requireObject,
} from "../../_shared/http.js";

export async function onRequestPatch({ request, env, params }) {
  try {
    const userId = await requireUserId(request, env);
    const linkId = parseId(params.id);
    const body = requireObject(await readJson(request));
    if (typeof body.is_active !== "boolean") {
      throw new HttpError(400, "INVALID_STATUS", "is_active phải là true hoặc false.");
    }

    const result = await env.DB.prepare(
      "UPDATE links SET is_active = ? WHERE id = ? AND user_id = ?",
    )
      .bind(body.is_active ? 1 : 0, linkId, userId)
      .run();
    if (result.meta?.changes !== 1) {
      throw new HttpError(404, "LINK_NOT_FOUND", "Không tìm thấy liên kết.");
    }

    const link = await env.DB.prepare(
      `SELECT id, original_url, short_code, custom_alias, title, expires_at,
              is_active, click_count, created_at
       FROM links WHERE id = ? AND user_id = ?`,
    )
      .bind(linkId, userId)
      .first();
    if (!link) throw new Error("Updated link could not be loaded.");
    return json({ link: { ...link, is_active: Boolean(link.is_active) } });
  } catch (error) {
    return errorResponse(error, "links/update");
  }
}

export async function onRequestDelete({ request, env, params }) {
  try {
    const userId = await requireUserId(request, env);
    const linkId = parseId(params.id);
    const result = await env.DB.prepare(
      "DELETE FROM links WHERE id = ? AND user_id = ?",
    )
      .bind(linkId, userId)
      .run();
    if (!Number.isInteger(result.meta?.changes)) {
      throw new Error("D1 did not return the DELETE change count.");
    }
    if (result.meta.changes < 1) {
      throw new HttpError(404, "LINK_NOT_FOUND", "Không tìm thấy liên kết.");
    }

    return json({ ok: true });
  } catch (error) {
    return errorResponse(error, "links/delete");
  }
}
