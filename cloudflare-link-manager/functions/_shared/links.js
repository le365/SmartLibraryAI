import { HttpError } from "./http.js";

export function normalizeUrl(value) {
  if (typeof value !== "string" || value.length > 2048) {
    throw new HttpError(400, "INVALID_URL", "URL phải có tối đa 2048 ký tự.");
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new HttpError(400, "INVALID_URL", "URL không hợp lệ.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new HttpError(400, "INVALID_URL", "Chỉ chấp nhận URL HTTP/HTTPS không chứa thông tin đăng nhập.");
  }
  return url.href;
}

export function normalizeExpiry(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 64) {
    throw new HttpError(400, "INVALID_EXPIRY", "Ngày hết hạn không hợp lệ.");
  }

  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T23:59:59.999Z` : value);
  if (
    !Number.isFinite(date.getTime()) ||
    (dateOnly && date.toISOString().slice(0, 10) !== value)
  ) {
    throw new HttpError(400, "INVALID_EXPIRY", "Ngày hết hạn không hợp lệ.");
  }
  if (date.getTime() <= Date.now()) {
    throw new HttpError(400, "INVALID_EXPIRY", "Ngày hết hạn phải ở tương lai.");
  }
  return date.toISOString();
}

export function randomShortCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function shortUrl(request, shortCode) {
  return `${new URL(request.url).origin}/s/${shortCode}`;
}
