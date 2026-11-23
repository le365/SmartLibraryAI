export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function errorResponse(c, error) {
  const requestId = c.get("requestId");
  return c.json({
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
      requestId,
    },
  }, error.status);
}

export function successResponse(c, data, status = 200) {
  return c.json({ data }, status);
}

export async function readJsonObject(c) {
  const contentType = c.req.header("content-type") || "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json.");
  }
  const contentLength = Number(c.req.header("content-length") || 0);
  if (contentLength > 65536) {
    throw new ApiError(413, "BODY_TOO_LARGE", "JSON request body must be at most 64 KB.");
  }
  let value;
  try {
    const raw = await c.req.text();
    if (new TextEncoder().encode(raw).byteLength > 65536) {
      throw new ApiError(413, "BODY_TOO_LARGE", "JSON request body must be at most 64 KB.");
    }
    value = JSON.parse(raw);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "INVALID_BODY", "Request body must be a JSON object.");
  }
  return value;
}

export function validEmail(value) {
  return typeof value === "string"
    && value.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function requiredText(value, field, { min = 1, max = 200 } = {}) {
  if (typeof value !== "string") {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} must be a string.`);
  }
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} must contain ${min}-${max} characters.`);
  }
  return normalized;
}

export function optionalText(value, field, { max = 5000 } = {}) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.trim().length > max) {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} must be text with at most ${max} characters.`);
  }
  return value.trim();
}

export function optionalHttpsUrl(value, field) {
  const text = optionalText(value, field, { max: 2048 });
  if (!text) return null;
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} must be a valid HTTPS URL.`);
  }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} must be a valid HTTPS URL without embedded credentials.`);
  }
  return url.toString();
}

export function integerInRange(value, field, { min = 0, max = 10000 } = {}) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

export function pagination(c) {
  const limitValue = c.req.query("limit");
  const offsetValue = c.req.query("offset");
  const limit = limitValue === undefined ? 50 : Number(limitValue);
  const offset = offsetValue === undefined ? 0 : Number(offsetValue);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new ApiError(400, "VALIDATION_ERROR", "limit must be an integer between 1 and 100.");
  }
  if (!Number.isInteger(offset) || offset < 0 || offset > 100000) {
    throw new ApiError(400, "VALIDATION_ERROR", "offset must be an integer between 0 and 100000.");
  }
  return { limit, offset };
}
