import { ApiError } from "./errors.js";

export async function forwardToAiService(c, path, payload) {
  const configuredUrl = c.env.AI_SERVICE_URL;
  if (!configuredUrl) {
    throw new ApiError(503, "AI_SERVICE_NOT_CONFIGURED", "The AI service has not been configured.");
  }
  let endpoint;
  try {
    const base = new URL(configuredUrl);
    if (base.protocol !== "https:" && !(c.env.APP_ENV === "development" && base.protocol === "http:")) {
      throw new Error("AI service URL must use HTTPS.");
    }
    endpoint = new URL(path, base.toString().endsWith("/") ? base : `${base}/`);
  } catch {
    throw new ApiError(503, "AI_SERVICE_MISCONFIGURED", "The AI service URL is invalid.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("AI service timed out"), 15000);
  let response;
  try {
    const headers = new Headers({ "content-type": "application/json", accept: "application/json" });
    if (c.env.AI_SERVICE_TOKEN) headers.set("authorization", `Bearer ${c.env.AI_SERVICE_TOKEN}`);
    response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new ApiError(504, "AI_SERVICE_TIMEOUT", "The AI service did not respond within 15 seconds.");
    }
    throw new ApiError(502, "AI_SERVICE_UNAVAILABLE", "The AI service could not be reached.");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new ApiError(502, "AI_SERVICE_ERROR", `The AI service returned status ${response.status}.`);
  }
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > 65536) {
    throw new ApiError(502, "AI_RESPONSE_TOO_LARGE", "The AI service returned an oversized response.");
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > 65536) {
    throw new ApiError(502, "AI_RESPONSE_TOO_LARGE", "The AI service returned an oversized response.");
  }
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new ApiError(502, "AI_INVALID_RESPONSE", "The AI service returned invalid JSON.");
  }
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new ApiError(502, "AI_INVALID_RESPONSE", "The AI service response must be a JSON object.");
  }
  return result;
}
