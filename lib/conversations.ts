import { randomUUID } from "node:crypto";
import { getDatabase } from "./database";
import type { Citation } from "./vector-store";

export type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  createdAt: string;
};

export type ConversationSummary = {
  id: string;
  title: string;
  model: "gpt" | "gemini" | "claude";
  ragEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Conversation = ConversationSummary & {
  messages: StoredMessage[];
};

type ConversationRow = {
  id: string;
  title: string;
  model: ConversationSummary["model"];
  rag_enabled: number;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  role: StoredMessage["role"];
  content: string;
  citations: string | null;
  created_at: string;
};

function toSummary(row: ConversationRow): ConversationSummary {
  return {
    id: row.id,
    title: row.title,
    model: row.model,
    ragEnabled: Boolean(row.rag_enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMessage(row: MessageRow): StoredMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    citations: row.citations ? (JSON.parse(row.citations) as Citation[]) : undefined,
    createdAt: row.created_at,
  };
}

export function listConversations(): ConversationSummary[] {
  const rows = getDatabase()
    .prepare(
      "SELECT id, title, model, rag_enabled, created_at, updated_at FROM conversations ORDER BY updated_at DESC",
    )
    .all() as ConversationRow[];
  return rows.map(toSummary);
}

export function createConversation(input: {
  title: string;
  model: ConversationSummary["model"];
  ragEnabled: boolean;
}): ConversationSummary {
  const id = randomUUID();
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      "INSERT INTO conversations (id, user_id, title, model, rag_enabled, created_at, updated_at) VALUES (?, NULL, ?, ?, ?, ?, ?)",
    )
    .run(id, input.title, input.model, Number(input.ragEnabled), now, now);
  return { id, ...input, createdAt: now, updatedAt: now };
}

export function getConversation(id: string): Conversation | undefined {
  const db = getDatabase();
  const row = db
    .prepare(
      "SELECT id, title, model, rag_enabled, created_at, updated_at FROM conversations WHERE id = ?",
    )
    .get(id) as ConversationRow | undefined;
  if (!row) {
    return undefined;
  }
  const messages = db
    .prepare(
      "SELECT id, role, content, citations, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
    )
    .all(id) as MessageRow[];
  return { ...toSummary(row), messages: messages.map(toMessage) };
}

export function addMessage(input: {
  conversationId: string;
  role: StoredMessage["role"];
  content: string;
  citations?: Citation[];
}): StoredMessage {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const db = getDatabase();
  const generatedTitle =
    input.role === "user"
      ? input.content.replace(/\s+/g, " ").slice(0, 60)
      : undefined;
  db.transaction(() => {
    db.prepare(
      "INSERT INTO messages (id, conversation_id, role, content, citations, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(
      id,
      input.conversationId,
      input.role,
      input.content,
      input.citations ? JSON.stringify(input.citations) : null,
      createdAt,
    );
    if (generatedTitle) {
      db.prepare(
        "UPDATE conversations SET title = CASE WHEN title = '新しい会話' THEN ? ELSE title END, updated_at = ? WHERE id = ?",
      ).run(generatedTitle, createdAt, input.conversationId);
    } else {
      db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").run(
        createdAt,
        input.conversationId,
      );
    }
  })();
  return { id, role: input.role, content: input.content, citations: input.citations, createdAt };
}

export function deleteConversation(id: string): boolean {
  return getDatabase()
    .prepare("DELETE FROM conversations WHERE id = ?")
    .run(id).changes > 0;
}
