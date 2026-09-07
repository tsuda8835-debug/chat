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

export function isPdfFile(file: File): boolean {
  return (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}
