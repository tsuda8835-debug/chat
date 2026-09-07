import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import {
  EmbeddingConfigurationError,
  addPdfDocument,
} from "../../../lib/vector-store";
import { isPdfFile, MAX_PDF_SIZE_BYTES } from "../../../lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "PDF ファイルを選択してください。" },
        { status: 400 },
      );
    }
    if (!isPdfFile(file)) {
      return NextResponse.json(
        { error: "PDF 形式のファイルのみアップロードできます。" },
        { status: 415 },
      );
    }
    if (file.size === 0 || file.size > MAX_PDF_SIZE_BYTES) {
      return NextResponse.json(
        { error: "PDF のサイズは 1 バイト以上 10 MB 以下にしてください。" },
        { status: 413 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
      return NextResponse.json(
        { error: "PDF の内容を確認できませんでした。" },
        { status: 415 },
      );
    }

    let text: string;
    try {
      const parser = new PDFParse({ data: buffer });
      try {
        const parsedPdf = await parser.getText();
        text = parsedPdf.text.trim();
      } finally {
        await parser.destroy();
      }
    } catch {
      return NextResponse.json(
        { error: "PDF を解析できませんでした。破損していないテキスト PDF を選択してください。" },
        { status: 422 },
      );
    }
    if (!text) {
      return NextResponse.json(
        { error: "PDF からテキストを抽出できませんでした。テキストを含む PDF を選択してください。" },
        { status: 422 },
      );
    }

    const safeName = file.name.replace(/[^\w.\-()\s]/g, "_").slice(0, 120);
    const chunks = await addPdfDocument(safeName || "uploaded.pdf", text);
    return NextResponse.json({
      filename: safeName || "uploaded.pdf",
      chunks,
      message: `${chunks} 件の検索チャンクを追加しました。`,
    });
  } catch (error) {
    if (error instanceof EmbeddingConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("PDF upload failed:", error);
    return NextResponse.json(
      { error: "PDF の処理中にエラーが発生しました。" },
      { status: 500 },
    );
  }
}
