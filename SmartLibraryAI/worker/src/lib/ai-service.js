import { ApiError } from "./errors.js";

function getAiServiceEndpoint(c, path) {
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
  return endpoint;
}

async function sendToAiService(c, path, body, contentType, timeoutMs = 15000) {
  const endpoint = getAiServiceEndpoint(c, path);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("AI service timed out"), timeoutMs);
  let response;
  try {
    const headers = new Headers({ accept: "application/json" });
    if (contentType) headers.set("content-type", contentType);
    if (c.env.AI_SERVICE_TOKEN) headers.set("authorization", `Bearer ${c.env.AI_SERVICE_TOKEN}`);
    response = await fetch(endpoint, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new ApiError(504, "AI_SERVICE_TIMEOUT", `The AI service did not respond within ${timeoutMs / 1000} seconds.`);
    }
    throw new ApiError(502, "AI_SERVICE_UNAVAILABLE", "The AI service could not be reached.");
  } finally {
    clearTimeout(timeout);
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
  if (!response.ok) {
    if (response.status === 503 && result?.detail?.code === "MODEL_NOT_TRAINED") {
      throw new ApiError(503, "MODEL_NOT_TRAINED", "No trained book-cover classifier is installed in the AI service.");
    }
    if (response.status === 400 || response.status === 413 || response.status === 415) {
      throw new ApiError(response.status, "INVALID_COVER", "The AI service rejected the uploaded book cover image.");
    }
    throw new ApiError(502, "AI_SERVICE_ERROR", `The AI service returned status ${response.status}.`);
  }
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new ApiError(502, "AI_INVALID_RESPONSE", "The AI service response must be a JSON object.");
  }
  return result;
}

export function forwardToAiService(c, path, payload) {
  return sendToAiService(c, path, JSON.stringify(payload), "application/json");
}

export function forwardImageToAiService(c, path, imageBytes, contentType, metadata) {
  const form = new FormData();
  form.append("file", new Blob([imageBytes], { type: contentType }), "book-cover");
  for (const [key, value] of Object.entries(metadata)) {
    if (value) form.append(key, value);
  }
  return sendToAiService(c, path, form, undefined, 30000);
}
