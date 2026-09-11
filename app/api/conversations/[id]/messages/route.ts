import { streamText, type ModelMessage } from "ai";
import { NextResponse } from "next/server";
import { addMessage, getConversation } from "../../../../../lib/conversations";
import {
  EmbeddingConfigurationError,
  searchKnowledge,
  type Citation,
} from "../../../../../lib/vector-store";
import {
  getLanguageModel,
  getModelLabel,
  ProviderConfigurationError,
} from "../../../../../lib/providers";
import { addMessageSchema } from "../../../../../lib/validation";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };
type StreamEvent =
  | { type: "status"; message: string }
  | { type: "citations"; citations: Citation[] }
  | { type: "delta"; text: string }
  | { type: "error"; message: string }
  | { type: "done" };

function ragInstructions(citations: Citation[]): string {
  if (citations.length === 0) {
    return "RAG 検索では十分に関連する文書が見つかりませんでした。推測を避け、そのことを率直に説明してください。";
  }
  const context = citations
    .map((citation, index) => `[${index + 1}] 出典: ${citation.source}\n${citation.excerpt}`)
    .join("\n\n");
  return `以下はローカル文書から検索した参考情報です。質問に関係する場合だけ使用し、情報にない事実を文書由来であるかのように断定しないでください。回答で使った出典は [1] のように示してください。\n\n${context}`;
}

export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const existingConversation = getConversation(id);
  if (!existingConversation) {
    return NextResponse.json({ error: "会話が見つかりません。" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON リクエストを解析できませんでした。" }, { status: 400 });
  }
  const parsed = addMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "メッセージ内容が正しくありません。" }, { status: 400 });
  }

  let languageModel;
  try {
    languageModel = getLanguageModel(parsed.data.model);
  } catch (error) {
    if (error instanceof ProviderConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    throw error;
  }

  const userMessage = addMessage({ conversationId: id, role: "user", content: parsed.data.content });
  const history: ModelMessage[] = [
    ...existingConversation.messages.map(({ role, content }) => ({ role, content })),
    { role: "user", content: userMessage.content },
  ];
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        let citations: Citation[] = [];
        if (parsed.data.ragEnabled) {
          send({ type: "status", message: "ナレッジを検索中..." });
          citations = await searchKnowledge(userMessage.content);
          send({ type: "citations", citations });
        }
        send({ type: "status", message: `${getModelLabel(parsed.data.model)} が回答を生成中...` });
        const result = streamText({
          model: languageModel,
          system: `あなたは簡潔で正確な日本語の AI アシスタントです。${parsed.data.ragEnabled ? `\n\n${ragInstructions(citations)}` : ""}`,
          messages: history,
          temperature: 0.4,
        });
        let content = "";
        for await (const delta of result.textStream) {
          content += delta;
          send({ type: "delta", text: delta });
        }
        if (content) {
          addMessage({ conversationId: id, role: "assistant", content, citations });
        }
        send({ type: "done" });
      } catch (error) {
        if (error instanceof EmbeddingConfigurationError) {
          send({ type: "error", message: error.message });
        } else {
          console.error("Conversation message failed:", error);
          send({ type: "error", message: "回答の生成中にエラーが発生しました。時間をおいて再試行してください。" });
        }
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
