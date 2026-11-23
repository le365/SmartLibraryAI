import { ApiError } from "./errors.js";

export function requireDb(env) {
  if (!env?.DB) {
    throw new ApiError(503, "DATABASE_NOT_CONFIGURED", "D1 binding DB is not configured for this environment.");
  }
  return env.DB;
}
