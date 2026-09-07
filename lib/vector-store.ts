import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { embed, embedMany } from "ai";
import { readFile } from "node:fs/promises";
import path from "node:path";

const CHUNK_SIZE = 850;
const CHUNK_OVERLAP = 140;
const MAX_CONTEXT_CHUNKS = 5;

export type Citation = {
  source: string;
  excerpt: string;
  score: number;
};

type VectorRecord = {
  id: string;
  source: string;
  text: string;
  embedding: number[];
};

type EmbeddingProvider = "openai" | "google";

export class EmbeddingConfigurationError extends Error {
  constructor() {
    super(
      "RAG を利用するには OPENAI_API_KEY または GOOGLE_GENERATIVE_AI_API_KEY を設定してください。",
    );
    this.name = "EmbeddingConfigurationError";
  }
}

let records: VectorRecord[] = [];
let knowledgeInitialization: Promise<void> | undefined;
let activeEmbeddingProvider: EmbeddingProvider | undefined;
let sequence = 0;

function selectEmbeddingProvider(): EmbeddingProvider {
  if (activeEmbeddingProvider) {
    return activeEmbeddingProvider;
  }
  if (process.env.OPENAI_API_KEY) {
    activeEmbeddingProvider = "openai";
    return activeEmbeddingProvider;
  }
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    activeEmbeddingProvider = "google";
    return activeEmbeddingProvider;
  }
  throw new EmbeddingConfigurationError();
}

function getEmbeddingModel() {
  return selectEmbeddingProvider() === "openai"
    ? openai.embedding("text-embedding-3-small")
    : google.textEmbeddingModel("gemini-embedding-001");
}

export function chunkText(text: string): string[] {
  const normalized = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (!normalized) {
    return [];
  }

  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    const candidate = normalized.slice(start, start + CHUNK_SIZE);
    const naturalBreak = Math.max(
      candidate.lastIndexOf("\n"),
      candidate.lastIndexOf("。"),
      candidate.lastIndexOf(". "),
    );
    const end =
      naturalBreak > Math.floor(CHUNK_SIZE * 0.55)
        ? start + naturalBreak + 1
        : start + candidate.length;
    chunks.push(normalized.slice(start, end).trim());
    if (end >= normalized.length) {
      break;
    }
    start = Math.max(start + 1, end - CHUNK_OVERLAP);
  }
  return chunks.filter(Boolean);
}

async function addText(source: string, text: string): Promise<number> {
  const chunks = chunkText(text);
  if (chunks.length === 0) {
    return 0;
  }

  const { embeddings } = await embedMany({
    model: getEmbeddingModel(),
    values: chunks,
  });
  const additions = chunks.map((chunk, index) => ({
    id: `${Date.now()}-${sequence++}`,
    source,
    text: chunk,
    embedding: embeddings[index],
  }));
  records = [...records, ...additions];
  return additions.length;
}

function knowledgePath(): string {
  const root = path.resolve(process.cwd());
  const filePath = path.resolve(root, "knowledge.txt");
  if (path.dirname(filePath) !== root) {
    throw new Error("knowledge.txt のパスを安全に解決できませんでした。");
  }
  return filePath;
}

export async function ensureKnowledgeInitialized(): Promise<void> {
  if (!knowledgeInitialization) {
    knowledgeInitialization = (async () => {
      const text = await readFile(knowledgePath(), "utf8");
      if (!text.trim()) {
        throw new Error("knowledge.txt が空です。RAG 用のナレッジを追加してください。");
      }
      await addText("knowledge.txt", text);
    })().catch((error: unknown) => {
      knowledgeInitialization = undefined;
      throw error;
    });
  }
  return knowledgeInitialization;
}

export async function addPdfDocument(
  filename: string,
  text: string,
): Promise<number> {
  await ensureKnowledgeInitialized();
  return addText(filename, text);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let aMagnitude = 0;
  let bMagnitude = 0;
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    dot += a[index] * b[index];
    aMagnitude += a[index] * a[index];
    bMagnitude += b[index] * b[index];
  }
  return aMagnitude === 0 || bMagnitude === 0
    ? 0
    : dot / (Math.sqrt(aMagnitude) * Math.sqrt(bMagnitude));
}

export async function searchKnowledge(query: string): Promise<Citation[]> {
  await ensureKnowledgeInitialized();
  const { embedding } = await embed({
    model: getEmbeddingModel(),
    value: query,
  });

  return records
    .map((record) => ({
      source: record.source,
      excerpt: record.text.slice(0, 280),
      score: cosineSimilarity(embedding, record.embedding),
    }))
    .filter((result) => result.score > 0.15)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CONTEXT_CHUNKS);
}
