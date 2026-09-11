import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Context — AI RAG Chat",
  description: "Local-memory RAG chat workspace",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
