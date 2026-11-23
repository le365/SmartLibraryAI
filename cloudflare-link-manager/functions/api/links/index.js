import { requireUserId } from "../../_shared/auth.js";
import {
  errorResponse,
  HttpError,
  json,
  readJson,
  requireObject,
} from "../../_shared/http.js";
import {
  normalizeExpiry,
  normalizeUrl,
  randomShortCode,
  shortUrl,
} from "../../_shared/links.js";

export async function onRequestGet({ request, env }) {
  try {
    const userId = await requireUserId(request, env);
    const { results } = await env.DB.prepare(
      `SELECT id, original_url, short_code, custom_alias, title, expires_at,
              is_active, click_count, created_at
       FROM links
       WHERE user_id = ?
       ORDER BY created_at DESC, id DESC`,
    )
      .bind(userId)
      .all();

    return json({
      links: results.map((link) => ({
        ...link,
        is_active: Boolean(link.is_active),
        short_url: shortUrl(request, link.short_code),
      })),
    });
  } catch (error) {
    return errorResponse(error, "links/list");
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const userId = await requireUserId(request, env);
    const body = requireObject(await readJson(request));
    const originalUrl = normalizeUrl(body.original_url);
    if (
      body.custom_alias !== undefined &&
      body.custom_alias !== null &&
      typeof body.custom_alias !== "string"
    ) {
      throw new HttpError(400, "INVALID_ALIAS", "Bí danh phải là chuỗi.");
    }
    const customAlias =
      typeof body.custom_alias === "string" && body.custom_alias.trim()
        ? body.custom_alias.trim()
        : null;

    if (customAlias && !/^[A-Za-z0-9_-]{3,48}$/.test(customAlias)) {
      throw new HttpError(
        400,
        "INVALID_ALIAS",
        "Bí danh phải có 3–48 ký tự gồm chữ, số, gạch nối hoặc gạch dưới.",
      );
    }
    if (body.title !== undefined && body.title !== null && typeof body.title !== "string") {
      throw new HttpError(400, "INVALID_TITLE", "Tiêu đề phải là chuỗi.");
    }
    const title = typeof body.title === "string" ? body.title.trim() : null;
    if (title && title.length > 120) {
      throw new HttpError(400, "INVALID_TITLE", "Tiêu đề tối đa 120 ký tự.");
    }
    const expiresAt = normalizeExpiry(body.expires_at);

    const attempts = customAlias ? 1 : 5;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const shortCode = customAlias || randomShortCode();
      const inserted = await env.DB.prepare(
        `INSERT INTO links
           (user_id, original_url, short_code, custom_alias, title, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT DO NOTHING`,
      )
        .bind(userId, originalUrl, shortCode, customAlias, title || null, expiresAt)
        .run();

      if (inserted.meta?.changes === 1) {
        const link = await env.DB.prepare(
          `SELECT id, original_url, short_code, custom_alias, title, expires_at,
                  is_active, click_count, created_at
           FROM links
           WHERE short_code = ? AND user_id = ?`,
        )
          .bind(shortCode, userId)
          .first();
        if (!link) throw new Error("Link insert succeeded but the new row could not be loaded.");
        return json(
          {
            link: {
              ...link,
              is_active: Boolean(link.is_active),
              short_url: shortUrl(request, link.short_code),
            },
          },
          201,
        );
      }

      if (customAlias) {
        throw new HttpError(409, "ALIAS_UNAVAILABLE", "Bí danh đã được sử dụng.");
      }
    }

    throw new HttpError(503, "CODE_GENERATION_FAILED", "Không thể tạo mã ngắn, vui lòng thử lại.");
  } catch (error) {
    return errorResponse(error, "links/create");
  }
}
