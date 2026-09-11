import { NextResponse } from "next/server";
import { deleteConversation, getConversation } from "../../../../lib/conversations";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: RouteContext) {
  const { id } = await params;
  const conversation = getConversation(id);
  if (!conversation) {
    return NextResponse.json({ error: "会話が見つかりません。" }, { status: 404 });
  }
  return NextResponse.json({ conversation });
}

export async function DELETE(_: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!deleteConversation(id)) {
    return NextResponse.json({ error: "会話が見つかりません。" }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}
