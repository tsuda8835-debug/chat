import { streamText, type ModelMessage } from "ai";
import {
  EmbeddingConfigurationError,
  searchKnowledge,
  type Citation,
} from "../../../lib/vector-store";
import {
  getLanguageModel,
  getModelLabel,
  ProviderConfigurationError,
} from "../../../lib/providers";
import { chatRequestSchema } from "../../../lib/validation";

export const runtime = "nodejs";

// Streamed as newline-delimited JSON so the client can render "thinking"
// status updates and citations before the answer text itself arrives.
type StreamEvent =
  | { type: "status"; message: string }
  | { type: "citations"; citations: Citation[] }
  | { type: "delta"; text: string }
  | { type: "error"; message: string }
  | { type: "done" };

function jsonResponse(payload: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function ragInstructions(citations: Citation[]): string {
  if (citations.length === 0) {
    return "RAG 検索では十分に関連する文書が見つかりませんでした。推測を避け、そのことを率直に説明してください。";
  }

  const context = citations
    .map(
      (citation, index) =>
        `[${index + 1}] 出典: ${citation.source}\n${citation.excerpt}`,
    )
    .join("\n\n");
  return `以下はローカル文書から検索した参考情報です。質問に関係する場合だけ使用し、情報にない事実を文書由来であるかのように断定しないでください。回答で使った出典は [1] のように示してください。\n\n${context}`;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "JSON リクエストを解析できませんでした。" }, 400);
  }

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: "リクエスト内容が正しくありません。" }, 400);
  }

  const { model, messages, ragEnabled } = parsed.data;

  let languageModel;
  try {
    languageModel = getLanguageModel(model);
  } catch (error) {
    if (error instanceof ProviderConfigurationError) {
      return jsonResponse({ error: error.message }, 503);
    }
    throw error;
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        let citations: Citation[] = [];
        if (ragEnabled) {
          send({ type: "status", message: "knowledge.txt を検索中..." });
          await wait(300);
          citations = await searchKnowledge(
            messages[messages.length - 1].content,
          );

          if (citations.some((citation) => citation.source !== "knowledge.txt")) {
            send({
              type: "status",
              message: "アップロード済み PDF のコンテキストを解析中...",
            });
            await wait(300);
          }

          send({ type: "citations", citations });
        }

        send({
          type: "status",
          message: `${getModelLabel(model)} が回答を生成中...`,
        });

        const result = streamText({
          model: languageModel,
          system: `あなたは簡潔で正確な日本語の AI アシスタントです。${ragEnabled ? `\n\n${ragInstructions(citations)}` : ""}`,
          messages: messages satisfies ModelMessage[],
          temperature: 0.4,
        });

        for await (const delta of result.textStream) {
          send({ type: "delta", text: delta });
        }

        send({ type: "done" });
      } catch (error) {
        if (error instanceof EmbeddingConfigurationError) {
          send({ type: "error", message: error.message });
        } else {
          console.error("Chat request failed:", error);
          send({
            type: "error",
            message:
              "回答の生成中にエラーが発生しました。時間をおいて再試行してください。",
          });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
