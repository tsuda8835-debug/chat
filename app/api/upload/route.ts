import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import {
  EmbeddingConfigurationError,
  addDocument,
} from "../../../lib/vector-store";
import {
  isPdfFile,
  isTextFile,
  MAX_PDF_SIZE_BYTES,
  MAX_TEXT_SIZE_BYTES,
} from "../../../lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "PDF、TXT、または Markdown ファイルを選択してください。" },
        { status: 400 },
      );
    }
    const isPdf = isPdfFile(file);
    const isText = isTextFile(file);
    if (!isPdf && !isText) {
      return NextResponse.json(
        { error: "PDF、TXT、または Markdown ファイルのみアップロードできます。" },
        { status: 415 },
      );
    }
    const maxSize = isPdf ? MAX_PDF_SIZE_BYTES : MAX_TEXT_SIZE_BYTES;
    if (file.size === 0 || file.size > maxSize) {
      return NextResponse.json(
        { error: `${isPdf ? "PDF" : "テキストファイル"} のサイズは 1 バイト以上 10 MB 以下にしてください。` },
        { status: 413 },
      );
    }

    let text: string;
    if (isPdf) {
      const buffer = Buffer.from(await file.arrayBuffer());
      if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
        return NextResponse.json(
          { error: "PDF の内容を確認できませんでした。" },
          { status: 415 },
        );
      }
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
    } else {
      text = (await file.text()).trim();
      if (text.includes("\0")) {
        return NextResponse.json(
          { error: "テキストファイルの内容を確認できませんでした。" },
          { status: 415 },
        );
      }
    }
    if (!text) {
      return NextResponse.json(
        {
          error: isPdf
            ? "PDF からテキストを抽出できませんでした。テキストを含む PDF を選択してください。"
            : "空のテキストファイルはアップロードできません。",
        },
        { status: 422 },
      );
    }

    const safeName = file.name.replace(/[^\w.\-()\s]/g, "_").slice(0, 120);
    const chunks = await addDocument(
      safeName || (isPdf ? "uploaded.pdf" : "uploaded.txt"),
      text,
    );
    return NextResponse.json({
      filename: safeName || (isPdf ? "uploaded.pdf" : "uploaded.txt"),
      chunks,
      message: `${chunks} 件の検索チャンクを追加しました。`,
    });
  } catch (error) {
    if (error instanceof EmbeddingConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("Document upload failed:", error);
    return NextResponse.json(
      { error: "ファイルの処理中にエラーが発生しました。" },
      { status: 500 },
    );
  }
}
