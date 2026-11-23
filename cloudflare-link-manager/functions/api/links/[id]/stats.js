import { requireUserId } from "../../../_shared/auth.js";
import {
  errorResponse,
  HttpError,
  json,
  parseId,
} from "../../../_shared/http.js";

export async function onRequestGet({ request, env, params }) {
  try {
    const userId = await requireUserId(request, env);
    const linkId = parseId(params.id);
    const url = new URL(request.url);
    const rawDays = url.searchParams.get("days") || "30";
    if (!/^\d+$/.test(rawDays)) {
      throw new HttpError(400, "INVALID_RANGE", "days phải là số từ 1 đến 365.");
    }
    const days = Number(rawDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      throw new HttpError(400, "INVALID_RANGE", "days phải là số từ 1 đến 365.");
    }

    const ownedLink = await env.DB.prepare(
      "SELECT id FROM links WHERE id = ? AND user_id = ?",
    )
      .bind(linkId, userId)
      .first();
    if (!ownedLink) throw new HttpError(404, "LINK_NOT_FOUND", "Không tìm thấy liên kết.");

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const [total, devices, countries, timeline] = await Promise.all([
      env.DB.prepare(
        "SELECT COUNT(*) AS count FROM click_logs WHERE link_id = ? AND clicked_at >= ?",
      )
        .bind(linkId, since)
        .first(),
      env.DB.prepare(
        `SELECT COALESCE(device_type, 'unknown') AS name, COUNT(*) AS count
         FROM click_logs WHERE link_id = ? AND clicked_at >= ?
         GROUP BY COALESCE(device_type, 'unknown') ORDER BY count DESC`,
      )
        .bind(linkId, since)
        .all(),
      env.DB.prepare(
        `SELECT COALESCE(country, 'unknown') AS name, COUNT(*) AS count
         FROM click_logs WHERE link_id = ? AND clicked_at >= ?
         GROUP BY COALESCE(country, 'unknown') ORDER BY count DESC`,
      )
        .bind(linkId, since)
        .all(),
      env.DB.prepare(
        `SELECT date(clicked_at) AS date, COUNT(*) AS count
         FROM click_logs WHERE link_id = ? AND clicked_at >= ?
         GROUP BY date(clicked_at) ORDER BY date ASC`,
      )
        .bind(linkId, since)
        .all(),
    ]);

    return json({
      days,
      since,
      total_clicks: total.count,
      by_device: devices.results,
      by_country: countries.results,
      by_day: timeline.results,
    });
  } catch (error) {
    return errorResponse(error, "links/stats");
  }
}
