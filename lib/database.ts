import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

let database: Database.Database | undefined;

function databasePath(): string {
  // Vercel and similar serverless filesystems are ephemeral; use managed storage there.
  return path.join(process.cwd(), "data", "chat.db");
}

export function getDatabase(): Database.Database {
  if (database) {
    return database;
  }

  const filePath = databasePath();
  mkdirSync(path.dirname(filePath), { recursive: true });
  database = new Database(filePath);
  database.pragma("journal_mode = WAL");
  database.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      title TEXT NOT NULL,
      model TEXT NOT NULL,
      rag_enabled INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      citations TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS messages_conversation_created_at
      ON messages (conversation_id, created_at);
  `);
  database.pragma("foreign_keys = ON");
  return database;
}
