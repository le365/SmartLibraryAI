import { HttpError } from "./http.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const SESSION_COOKIE = "session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const PASSWORD_ITERATIONS = 210_000;

function encodeBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function getSessionSecret(env) {
  const secret = env.SESSION_SECRET;
  if (typeof secret !== "string" || encoder.encode(secret).length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 bytes.");
  }
  return secret;
}

export function ensureSessionSecret(env) {
  getSessionSecret(env);
}

async function importSessionKey(secret, usages) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages,
  );
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const digest = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PASSWORD_ITERATIONS },
    key,
    256,
  );

  return [
    "pbkdf2-sha256",
    PASSWORD_ITERATIONS,
    encodeBase64Url(salt),
    encodeBase64Url(new Uint8Array(digest)),
  ].join("$");
}

export async function verifyPassword(password, storedHash) {
  const [algorithm, iterationsText, saltText, digestText, extra] =
    String(storedHash).split("$");
  const iterations = Number(iterationsText);
  if (
    algorithm !== "pbkdf2-sha256" ||
    extra !== undefined ||
    !Number.isInteger(iterations) ||
    iterations < 100_000 ||
    iterations > 600_000
  ) {
    return false;
  }

  try {
    const salt = decodeBase64Url(saltText);
    const expected = decodeBase64Url(digestText);
    if (salt.length !== 16 || expected.length !== 32) return false;

    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const digest = new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: "PBKDF2", hash: "SHA-256", salt, iterations },
        key,
        256,
      ),
    );

    let difference = 0;
    for (let index = 0; index < expected.length; index += 1) {
      difference |= expected[index] ^ digest[index];
    }
    return difference === 0;
  } catch {
    return false;
  }
}

export async function createSessionToken(userId, env) {
  const secret = getSessionSecret(env);
  const payload = {
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const encodedPayload = encodeBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await importSessionKey(secret, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(encodedPayload));
  return `${encodedPayload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

async function verifySessionToken(token, env) {
  const secret = getSessionSecret(env);
  if (typeof token !== "string" || token.length > 2048) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  try {
    const [encodedPayload, encodedSignature] = parts;
    const key = await importSessionKey(secret, ["verify"]);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64Url(encodedSignature),
      encoder.encode(encodedPayload),
    );
    if (!valid) return null;

    const payload = JSON.parse(decoder.decode(decodeBase64Url(encodedPayload)));
    if (
      !Number.isSafeInteger(payload.sub) ||
      payload.sub < 1 ||
      !Number.isSafeInteger(payload.exp) ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return payload.sub;
  } catch {
    return null;
  }
}

function getSessionToken(request) {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) return authorization.slice(7);

  const cookieHeader = request.headers.get("cookie") || "";
  for (const entry of cookieHeader.split(";")) {
    const separator = entry.indexOf("=");
    if (separator < 0 || entry.slice(0, separator).trim() !== SESSION_COOKIE) continue;
    return entry.slice(separator + 1).trim();
  }
  return null;
}

export async function requireUserId(request, env) {
  const userId = await verifySessionToken(getSessionToken(request), env);
  if (!userId) throw new HttpError(401, "UNAUTHORIZED", "Vui lòng đăng nhập.");
  return userId;
}

export async function sessionCookie(request, userId, env) {
  const token = await createSessionToken(userId, env);
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

export function clearSessionCookie(request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
