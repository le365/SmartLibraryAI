import { Hono } from "hono";
import { ApiError, pagination, readJsonObject, requiredText, successResponse } from "../lib/errors.js";
import { requireDb } from "../lib/db.js";
import { forwardToAiService } from "../lib/ai-service.js";
import { requireAuth } from "../middleware/auth.js";

const chat = new Hono();

chat.use("*", requireAuth);

chat.get("/:conversationId", async (c) => {
  const { limit, offset } = pagination(c);
  const user = c.get("auth");
  const db = requireDb(c.env);
  const [rows, count] = await Promise.all([
    db.prepare(`
      SELECT id, role, content, created_at
      FROM chat_messages
      WHERE user_id = ? AND conversation_id = ?
      ORDER BY created_at LIMIT ? OFFSET ?
    `).bind(user.id, c.req.param("conversationId"), limit, offset).all(),
    db.prepare(`
      SELECT COUNT(*) AS total FROM chat_messages
      WHERE user_id = ? AND conversation_id = ?
    `).bind(user.id, c.req.param("conversationId")).first(),
  ]);
  return successResponse(c, {
    conversationId: c.req.param("conversationId"),
    items: rows.results.map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      createdAt: row.created_at,
    })),
    pagination: { limit, offset, total: count.total },
  });
});

chat.post("/", async (c) => {
  const body = await readJsonObject(c);
  const message = requiredText(body.message, "message", { max: 4000 });
  const conversationId = body.conversationId === undefined
    ? crypto.randomUUID()
    : requiredText(body.conversationId, "conversationId", { max: 100 });
  const history = body.history ?? [];
  if (!Array.isArray(history) || history.length > 20) {
    throw new ApiError(400, "VALIDATION_ERROR", "history must be an array containing at most 20 messages.");
  }
  const validatedHistory = history.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)
      || !["user", "assistant"].includes(item.role)
      || typeof item.content !== "string"
      || item.content.trim().length > 4000) {
      throw new ApiError(400, "VALIDATION_ERROR", `history[${index}] must contain a user/assistant role and text content.`);
    }
    return { role: item.role, content: item.content.trim() };
  });
  const result = await forwardToAiService(c, "chat", {
    message,
    history: validatedHistory,
    user: { role: c.get("auth").role },
  });
  const assistantMessage = typeof result.reply === "string"
    ? result.reply
    : typeof result.content === "string"
      ? result.content
      : JSON.stringify(result);
  if (!assistantMessage.trim() || assistantMessage.length > 12000) {
    throw new ApiError(502, "AI_INVALID_RESPONSE", "The AI service returned an empty or oversized chat message.");
  }

  const user = c.get("auth");
  const now = new Date().toISOString();
  const db = requireDb(c.env);
  await db.batch([
    db.prepare(`
      INSERT INTO chat_messages (id, user_id, conversation_id, role, content, created_at)
      VALUES (?, ?, ?, 'user', ?, ?)
    `).bind(crypto.randomUUID(), user.id, conversationId, message, now),
    db.prepare(`
      INSERT INTO chat_messages (id, user_id, conversation_id, role, content, created_at)
      VALUES (?, ?, ?, 'assistant', ?, ?)
    `).bind(crypto.randomUUID(), user.id, conversationId, assistantMessage, now),
  ]);
  return successResponse(c, { conversationId, result });
});

export default chat;
