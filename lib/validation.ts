import { z } from "zod";
import { modelIds } from "./providers";

export const chatRequestSchema = z.object({
  model: z.enum(modelIds),
  ragEnabled: z.boolean(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(8_000),
      }),
    )
    .min(1)
    .max(30),
});

export const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_TEXT_SIZE_BYTES = 10 * 1024 * 1024;

export function isPdfFile(file: File): boolean {
  return (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}

export function isTextFile(file: File): boolean {
  const filename = file.name.toLowerCase();
  return (
    file.type === "text/plain" ||
    file.type === "text/markdown" ||
    filename.endsWith(".txt") ||
    filename.endsWith(".md")
  );
}

export const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(120),
  model: z.enum(modelIds),
  ragEnabled: z.boolean(),
});

export const addMessageSchema = z.object({
  model: z.enum(modelIds),
  ragEnabled: z.boolean(),
  content: z.string().trim().min(1).max(8_000),
});
