import { Hono } from "hono";
import { requireDb } from "./lib/db.js";
import { ApiError, errorResponse, successResponse } from "./lib/errors.js";
import { corsMiddleware } from "./middleware/cors.js";
import aiRoutes from "./routes/ai.js";
import authRoutes from "./routes/auth.js";
import booksRoutes from "./routes/books.js";
import borrowingsRoutes from "./routes/borrowings.js";
import categoriesRoutes from "./routes/categories.js";
import chatRoutes from "./routes/chat.js";
import readersRoutes from "./routes/readers.js";
import returnsRoutes from "./routes/returns.js";
import statisticsRoutes from "./routes/statistics.js";

const app = new Hono();

app.use("*", async (c, next) => {
  c.set("requestId", crypto.randomUUID());
  await next();
});
app.use("*", corsMiddleware);

app.get("/health", (c) => successResponse(c, { status: "ok" }));
app.get("/health/db", async (c) => {
  const db = requireDb(c.env);
  try {
    const result = await db.prepare("SELECT 1 AS connected").first();
    if (result?.connected !== 1) {
      throw new ApiError(503, "DATABASE_UNAVAILABLE", "D1 did not confirm the connection.");
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, "DATABASE_UNAVAILABLE", "Could not connect to the configured D1 database.");
  }
  return successResponse(c, { status: "ok", database: "connected" });
});
app.route("/api/auth", authRoutes);
app.route("/api/books", booksRoutes);
app.route("/api/categories", categoriesRoutes);
app.route("/api/readers", readersRoutes);
app.route("/api/borrowings", borrowingsRoutes);
app.route("/api/returns", returnsRoutes);
app.route("/api/statistics", statisticsRoutes);
app.route("/api/chat", chatRoutes);
app.route("/api/ai", aiRoutes);

app.notFound((c) => c.json({
  error: {
    code: "NOT_FOUND",
    message: "The requested API route was not found.",
    requestId: c.get("requestId"),
  },
}, 404));

app.onError((error, c) => {
  if (error instanceof ApiError) return errorResponse(c, error);
  console.error("Unhandled API error", { requestId: c.get("requestId"), message: error.message });
  return c.json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected server error occurred.",
      requestId: c.get("requestId"),
    },
  }, 500);
});

export default app;
