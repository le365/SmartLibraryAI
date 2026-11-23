import { ApiError } from "../lib/errors.js";

function allowedOrigins(env) {
  return (env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export async function corsMiddleware(c, next) {
  const origin = c.req.header("origin");
  const allowed = allowedOrigins(c.env);
  if (origin && !allowed.includes(origin)) {
    throw new ApiError(403, "ORIGIN_NOT_ALLOWED", "This origin is not allowed to call the API.");
  }

  if (origin) {
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Access-Control-Allow-Credentials", "true");
    c.header("Vary", "Origin");
  }

  if (c.req.method === "OPTIONS") {
    c.header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type");
    c.header("Access-Control-Max-Age", "86400");
    return c.body(null, 204);
  }

  await next();
}
