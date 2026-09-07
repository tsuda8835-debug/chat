import { generateText, type ModelMessage } from "ai";
import { NextResponse } from "next/server";
import {
  EmbeddingConfigurationError,
  searchKnowledge,
  type Citation,
} from "../../../lib/vector-store";
import {
  getLanguageModel,
  ProviderConfigurationError,
} from "../../../lib/providers";
import { chatRequestSchema } from "../../../lib/validation";

export const runtime = "nodejs";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
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

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = chatRequestSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("リクエスト内容が正しくありません。", 400);
    }

    const { model, messages, ragEnabled } = parsed.data;
    const languageModel = getLanguageModel(model);
    const citations = ragEnabled
      ? await searchKnowledge(messages[messages.length - 1].content)
      : [];
    const result = await generateText({
      model: languageModel,
      system: `あなたは簡潔で正確な日本語の AI アシスタントです。${ragEnabled ? `\n\n${ragInstructions(citations)}` : ""}`,
      messages: messages satisfies ModelMessage[],
      temperature: 0.4,
    });

    return NextResponse.json({
      text: result.text,
      citations,
    });
  } catch (error) {
    if (
      error instanceof ProviderConfigurationError ||
      error instanceof EmbeddingConfigurationError
    ) {
      return errorResponse(error.message, 503);
    }
    if (error instanceof SyntaxError) {
      return errorResponse("JSON リクエストを解析できませんでした。", 400);
    }
    console.error("Chat request failed:", error);
    return errorResponse(
      "回答の生成中にエラーが発生しました。時間をおいて再試行してください。",
      500,
    );
  }
}
