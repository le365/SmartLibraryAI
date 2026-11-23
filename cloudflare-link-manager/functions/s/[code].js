import { errorResponse, json, HttpError } from "../_shared/http.js";
import { normalizeUrl } from "../_shared/links.js";

function detectDevice(userAgent) {
  const agent = userAgent.toLowerCase();
  if (/bot|crawler|spider|preview|headless/.test(agent)) return "bot";
  if (/ipad|tablet|kindle|silk/.test(agent)) return "tablet";
  if (/mobile|iphone|ipod|android/.test(agent)) return "mobile";
  return "desktop";
}

function getRefererOrigin(value) {
  if (!value) return null;
  try {
    return new URL(value).origin.slice(0, 512);
  } catch {
    return null;
  }
}

export async function onRequestGet({ request, env, params }) {
  try {
    if (!env.DB) throw new Error("D1 binding DB is not configured.");
    const shortCode = params.code;
    if (!/^[A-Za-z0-9_-]{3,64}$/.test(shortCode)) {
      throw new HttpError(404, "LINK_NOT_FOUND", "Liên kết không tồn tại.");
    }

    const link = await env.DB.prepare(
      `SELECT id, original_url, is_active, expires_at
       FROM links WHERE short_code = ?`,
    )
      .bind(shortCode)
      .first();
    if (!link) throw new HttpError(404, "LINK_NOT_FOUND", "Liên kết không tồn tại.");
    if (!link.is_active) {
      throw new HttpError(410, "LINK_INACTIVE", "Liên kết đã bị vô hiệu hóa.");
    }
    if (link.expires_at && Date.parse(link.expires_at) <= Date.now()) {
      throw new HttpError(410, "LINK_EXPIRED", "Liên kết đã hết hạn.");
    }

    const destination = normalizeUrl(link.original_url);
    const userAgent = (request.headers.get("user-agent") || "").slice(0, 512) || null;
    const device = userAgent ? detectDevice(userAgent) : "unknown";
    const country = request.cf?.country || null;
    const referer = getRefererOrigin(request.headers.get("referer"));
    const clickedAt = new Date().toISOString();

    const results = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO click_logs (link_id, clicked_at, user_agent, device_type, country, referer)
         SELECT id, ?, ?, ?, ?, ? FROM links
         WHERE id = ? AND is_active = 1 AND (expires_at IS NULL OR expires_at > ?)`,
      ).bind(clickedAt, userAgent, device, country, referer, link.id, clickedAt),
      env.DB.prepare(
        `UPDATE links SET click_count = click_count + 1
         WHERE id = ? AND is_active = 1 AND (expires_at IS NULL OR expires_at > ?)`,
      ).bind(link.id, clickedAt),
    ]);

    if (results[0]?.meta?.changes !== 1 || results[1]?.meta?.changes !== 1) {
      const current = await env.DB.prepare(
        "SELECT is_active, expires_at FROM links WHERE id = ?",
      )
        .bind(link.id)
        .first();
      if (!current) throw new HttpError(404, "LINK_NOT_FOUND", "Liên kết không tồn tại.");
      if (!current.is_active) {
        throw new HttpError(410, "LINK_INACTIVE", "Liên kết đã bị vô hiệu hóa.");
      }
      throw new HttpError(410, "LINK_EXPIRED", "Liên kết đã hết hạn.");
    }

    return Response.redirect(destination, 302);
  } catch (error) {
    if (error instanceof HttpError) {
      return json(
        { error: { code: error.code, message: error.message } },
        error.status,
      );
    }
    return errorResponse(error, "links/redirect");
  }
}
