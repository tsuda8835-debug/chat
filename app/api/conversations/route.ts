import { NextResponse } from "next/server";
import { createConversation, listConversations } from "../../../lib/conversations";
import { createConversationSchema } from "../../../lib/validation";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ conversations: listConversations() });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON リクエストを解析できませんでした。" }, { status: 400 });
  }
  const parsed = createConversationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "会話の内容が正しくありません。" }, { status: 400 });
  }
  return NextResponse.json({ conversation: createConversation(parsed.data) }, { status: 201 });
}
