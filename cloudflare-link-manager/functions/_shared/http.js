export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function json(data, status = 200, headers = {}) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("content-type", "application/json; charset=utf-8");
  responseHeaders.set("cache-control", "no-store");

  return new Response(JSON.stringify(data), {
    status,
    headers: responseHeaders,
  });
}

export function errorResponse(error, scope) {
  if (error instanceof HttpError) {
    return json(
      { error: { code: error.code, message: error.message } },
      error.status,
    );
  }

  console.error(`[${scope}]`, error);
  return json(
    { error: { code: "INTERNAL_ERROR", message: "Đã xảy ra lỗi máy chủ." } },
    500,
  );
}

export async function readJson(request) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Yêu cầu phải dùng JSON.");
  }

  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "INVALID_JSON", "Nội dung JSON không hợp lệ.");
  }
}

export function requireObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "INVALID_BODY", "Nội dung yêu cầu phải là một object JSON.");
  }

  return value;
}

export function parseId(value) {
  if (!/^[1-9]\d*$/.test(String(value))) {
    throw new HttpError(400, "INVALID_ID", "ID không hợp lệ.");
  }

  const id = Number(value);
  if (!Number.isSafeInteger(id)) {
    throw new HttpError(400, "INVALID_ID", "ID không hợp lệ.");
  }

  return id;
}
