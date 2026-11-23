const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8787").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(message, { status = 0, code = "NETWORK_ERROR", details, requestId } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

async function request(path, { method = "GET", body, query, signal } = {}) {
  const url = new URL(`${API_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }

  const headers = { accept: "application/json" };
  const options = { method, headers, credentials: "include", signal };
  if (body !== undefined) {
    if (typeof FormData !== "undefined" && body instanceof FormData) {
      options.body = body;
    } else {
      headers["content-type"] = "application/json";
      options.body = JSON.stringify(body);
    }
  }

  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new ApiError("Không thể kết nối API. Hãy kiểm tra Worker đang chạy và cấu hình URL.", {
      code: "API_UNAVAILABLE",
    });
  }

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ApiError("API trả về dữ liệu không hợp lệ.", {
        status: response.status,
        code: "INVALID_API_RESPONSE",
      });
    }
  }
  if (!response.ok) {
    const error = payload?.error;
    throw new ApiError(error?.message || `Yêu cầu thất bại (${response.status}).`, {
      status: response.status,
      code: error?.code || "API_ERROR",
      details: error?.details,
      requestId: error?.requestId,
    });
  }
  return payload?.data;
}

const listQuery = (params = {}) => ({
  limit: params.limit ?? 100,
  offset: params.offset ?? 0,
  search: params.search,
  category: params.category,
  status: params.status,
});

export const api = {
  auth: {
    login: (credentials) => request("/api/auth/login", { method: "POST", body: credentials }),
    register: (details) => request("/api/auth/register", { method: "POST", body: details }),
    me: () => request("/api/auth/me"),
    logout: () => request("/api/auth/logout", { method: "POST", body: {} }),
  },
  books: {
    list: (params) => request("/api/books", { query: listQuery(params) }),
    get: (id) => request(`/api/books/${encodeURIComponent(id)}`),
    create: (book) => request("/api/books", { method: "POST", body: book }),
    update: (id, changes) => request(`/api/books/${encodeURIComponent(id)}`, { method: "PATCH", body: changes }),
    delete: (id) => request(`/api/books/${encodeURIComponent(id)}`, { method: "DELETE" }),
    uploadCover: (id, file) => {
      const body = new FormData();
      body.append("file", file);
      return request(`/api/books/${encodeURIComponent(id)}/cover`, { method: "POST", body });
    },
    deleteCover: (id) => request(`/api/books/${encodeURIComponent(id)}/cover`, { method: "DELETE" }),
  },
  categories: {
    list: (params = {}) => request("/api/categories", { query: { limit: params.limit ?? 100, offset: params.offset ?? 0 } }),
  },
  readers: {
    list: (params) => request("/api/readers", { query: listQuery(params) }),
    get: (id) => request(`/api/readers/${encodeURIComponent(id)}`),
    create: (reader) => request("/api/readers", { method: "POST", body: reader }),
    update: (id, changes) => request(`/api/readers/${encodeURIComponent(id)}`, { method: "PATCH", body: changes }),
    delete: (id) => request(`/api/readers/${encodeURIComponent(id)}`, { method: "DELETE" }),
  },
  borrowings: {
    list: (params) => request("/api/borrowings", { query: listQuery(params) }),
    create: (borrowing) => request("/api/borrowings", { method: "POST", body: borrowing }),
    listRequests: (params) => request("/api/borrowings/requests", { query: listQuery(params) }),
    request: (bookId) => request("/api/borrowings/requests", { method: "POST", body: { bookId } }),
    reviewRequest: (id, decision, note = "") => request(`/api/borrowings/requests/${encodeURIComponent(id)}/review`, {
      method: "POST",
      body: { decision, note },
    }),
  },
  returns: {
    create: (borrowingId, note = "") => request(`/api/returns/${encodeURIComponent(borrowingId)}`, {
      method: "POST",
      body: { note },
    }),
  },
};

export { API_BASE_URL };
