"use client";

import {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";

type ModelId = "gpt" | "gemini" | "claude";

type Citation = {
  source: string;
  excerpt: string;
  score: number;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
};

type ConversationSummary = {
  id: string;
  title: string;
  model: ModelId;
  ragEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

const models: Array<{ id: ModelId; label: string; detail: string }> = [
  { id: "gpt", label: "GPT", detail: "OpenAI" },
  { id: "gemini", label: "Gemini", detail: "Google" },
  { id: "claude", label: "Claude", detail: "Anthropic" },
];

function UploadIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.7"
    >
      <path d="M12 16V4m0 0L8 8m4-4 4 4M5 15v3a2 2 0 002 2h10a2 2 0 002-2v-3" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  );
}

export default function ChatPage() {
  const [model, setModel] = useState<ModelId>("gpt");
  const [ragEnabled, setRagEnabled] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [thinkingStatus, setThinkingStatus] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadConversations();
  }, []);

  async function loadConversations() {
    try {
      const response = await fetch("/api/conversations");
      const data: { conversations?: ConversationSummary[]; error?: string } = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "履歴を読み込めませんでした。");
      }
      setConversations(data.conversations ?? []);
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : "履歴を読み込めませんでした。");
    }
  }

  async function createNewConversation() {
    const response = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "新しい会話", model, ragEnabled }),
    });
    const data: { conversation?: ConversationSummary; error?: string } = await response.json();
    if (!response.ok || !data.conversation) {
      throw new Error(data.error ?? "会話を作成できませんでした。");
    }
    setConversations((current) => [data.conversation!, ...current]);
    setActiveConversationId(data.conversation.id);
    setMessages([]);
    return data.conversation.id;
  }

  async function selectConversation(id: string) {
    if (isSending || id === activeConversationId) return;
    try {
      const response = await fetch(`/api/conversations/${id}`);
      const data: { conversation?: ConversationSummary & { messages: Message[] }; error?: string } = await response.json();
      if (!response.ok || !data.conversation) throw new Error(data.error ?? "会話を読み込めませんでした。");
      setActiveConversationId(id);
      setMessages(data.conversation.messages);
      setModel(data.conversation.model);
      setRagEnabled(data.conversation.ragEnabled);
      setError(null);
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : "会話を読み込めませんでした。");
    }
  }

  async function removeConversation(id: string) {
    if (isSending) return;
    try {
      const response = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("会話を削除できませんでした。");
      setConversations((current) => current.filter((conversation) => conversation.id !== id));
      if (activeConversationId === id) {
        setActiveConversationId(null);
        setMessages([]);
      }
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : "会話を削除できませんでした。");
    }
  }

  async function uploadDocument(file: File) {
    setError(null);
    setNotice(null);
    const filename = file.name.toLowerCase();
    const isPdf = file.type === "application/pdf" || filename.endsWith(".pdf");
    const isText = file.type === "text/plain" || file.type === "text/markdown" || filename.endsWith(".txt") || filename.endsWith(".md");
    if (!isPdf && !isText) {
      setError("PDF、TXT、または Markdown ファイルを選択してください。");
      return;
    }
    if (file.size === 0 || file.size > 10 * 1024 * 1024) {
      setError(`${isPdf ? "PDF" : "テキストファイル"} のサイズは 1 バイト以上 10 MB 以下にしてください。`);
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data: { filename?: string; message?: string; error?: string } =
        await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "ファイルをアップロードできませんでした。");
      }
      setUploadedFiles((files) => [
        ...files,
        data.filename ?? file.name,
      ]);
      setNotice(data.message ?? "ファイルを検索対象へ追加しました。");
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "ファイルをアップロードできませんでした。",
      );
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      void uploadDocument(file);
    }
  }

  async function submitMessage(event?: FormEvent) {
    event?.preventDefault();
    const text = input.trim();
    if (!text || isSending) {
      return;
    }

    let conversationId = activeConversationId;
    try {
      if (!conversationId) {
        conversationId = await createNewConversation();
      }
    } catch (creationError) {
      setError(creationError instanceof Error ? creationError.message : "会話を作成できませんでした。");
      return;
    }

    const nextMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };
    setMessages((current) => [...current, nextMessage]);
    setInput("");
    setError(null);
    setNotice(null);
    setIsSending(true);
    setThinkingStatus("送信しています...");

    const assistantId = crypto.randomUUID();
    let assistantAdded = false;
    let streamErrorMessage: string | null = null;

    function ensureAssistantMessage() {
      if (assistantAdded) {
        return;
      }
      assistantAdded = true;
      setMessages((currentMessages) => [
        ...currentMessages,
        { id: assistantId, role: "assistant", content: "" },
      ]);
    }

    function applyStreamEvent(event: {
      type: string;
      message?: string;
      citations?: Citation[];
      text?: string;
    }) {
      switch (event.type) {
        case "status":
          setThinkingStatus(event.message ?? null);
          break;
        case "citations":
          ensureAssistantMessage();
          setMessages((currentMessages) =>
            currentMessages.map((message) =>
              message.id === assistantId
                ? { ...message, citations: event.citations }
                : message,
            ),
          );
          break;
        case "delta":
          ensureAssistantMessage();
          setThinkingStatus(null);
          setMessages((currentMessages) =>
            currentMessages.map((message) =>
              message.id === assistantId
                ? { ...message, content: message.content + (event.text ?? "") }
                : message,
            ),
          );
          break;
        case "error":
          streamErrorMessage =
            event.message ?? "回答を生成できませんでした。";
          break;
        default:
          break;
      }
    }

    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          ragEnabled,
          content: text,
        }),
      });

      if (!response.ok || !response.body) {
        const data: { error?: string } = await response
          .json()
          .catch(() => ({}));
        throw new Error(data.error ?? "回答を生成できませんでした。");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex >= 0) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (line) {
            applyStreamEvent(JSON.parse(line));
          }
          newlineIndex = buffer.indexOf("\n");
        }
      }
      if (buffer.trim()) {
        applyStreamEvent(JSON.parse(buffer.trim()));
      }

      if (streamErrorMessage) {
        throw new Error(streamErrorMessage);
      }
    } catch (chatError) {
      if (assistantAdded) {
        setMessages((currentMessages) =>
          currentMessages.filter((message) => message.id !== assistantId),
        );
      }
      setError(
        chatError instanceof Error
          ? chatError.message
          : "回答を生成できませんでした。",
      );
    } finally {
      setIsSending(false);
      setThinkingStatus(null);
      void loadConversations();
    }
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitMessage();
    }
  }

  return (
    <main className="min-h-screen px-4 py-5 sm:px-8 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-6xl flex-col overflow-hidden rounded-3xl border border-black/10 bg-[#fcfcfa] shadow-panel sm:min-h-[calc(100vh-4rem)]">
        <header className="flex flex-col gap-5 border-b border-black/10 px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#171717] text-sm font-semibold text-white">
              C
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight">Context</h1>
              <p className="text-xs text-black/45">Local RAG workspace</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              aria-label="モデルを選択"
              className="flex rounded-xl border border-black/10 bg-white p-1"
            >
              {models.map((option) => (
                <button
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    model === option.id
                      ? "bg-[#171717] text-white shadow-sm"
                      : "text-black/50 hover:text-black"
                  }`}
                  key={option.id}
                  onClick={() => setModel(option.id)}
                  title={option.detail}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>

            <button
              aria-pressed={ragEnabled}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition ${
                ragEnabled
                  ? "border-black bg-black text-white"
                  : "border-black/10 bg-white text-black/55"
              }`}
              onClick={() => setRagEnabled((enabled) => !enabled)}
              type="button"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  ragEnabled ? "bg-white" : "bg-black/30"
                }`}
              />
              RAG {ragEnabled ? "ON" : "OFF"}
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="thin-scrollbar max-h-[48vh] overflow-y-auto border-b border-black/10 bg-[#f8f8f6] p-5 lg:max-h-none lg:border-b-0 lg:border-r">
            <div className="mb-6">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-black/40">履歴</p>
                <button className="rounded-md px-2 py-1 text-[11px] font-semibold text-black/60 hover:bg-black/5 hover:text-black" disabled={isSending} onClick={() => void createNewConversation().catch((creationError: unknown) => setError(creationError instanceof Error ? creationError.message : "会話を作成できませんでした。"))} type="button">新規作成</button>
              </div>
              <div className="space-y-1">
                {conversations.length === 0 ? (
                  <p className="px-2 text-[11px] leading-5 text-black/40">保存済みの会話はありません。</p>
                ) : conversations.map((conversation) => (
                  <div className={`group flex items-center rounded-lg ${activeConversationId === conversation.id ? "bg-black text-white" : "hover:bg-black/5"}`} key={conversation.id}>
                    <button className="min-w-0 flex-1 truncate px-2 py-2 text-left text-xs" onClick={() => void selectConversation(conversation.id)} type="button">{conversation.title}</button>
                    <button aria-label={`${conversation.title}を削除`} className="mr-1 rounded px-1.5 py-1 text-xs opacity-50 hover:bg-white/15 hover:opacity-100" onClick={() => void removeConversation(conversation.id)} type="button">×</button>
                  </div>
                ))}
              </div>
            </div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-black/40">
              Knowledge
            </p>
            <button
              className="group flex w-full flex-col items-center justify-center rounded-2xl border border-dashed border-black/20 bg-white px-4 py-6 text-center transition hover:border-black/45 hover:bg-[#fafafa] disabled:cursor-wait disabled:opacity-60"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              <span className="mb-2 grid h-9 w-9 place-items-center rounded-full bg-black text-white">
                <UploadIcon />
              </span>
              <span className="text-xs font-semibold">
                {isUploading ? "処理しています…" : "文書を追加"}
              </span>
              <span className="mt-1 text-[11px] leading-relaxed text-black/45">
                最大 10 MB · PDF / TXT / Markdown
              </span>
            </button>
            <input
              accept="application/pdf,.pdf,text/plain,.txt,text/markdown,.md"
              className="sr-only"
              onChange={onFileChange}
              ref={fileInputRef}
              type="file"
            />

            <div className="mt-5">
              <p className="text-[11px] font-medium text-black/40">
                検索対象
              </p>
              <div className="mt-2 space-y-2">
                <div className="rounded-lg border border-black/8 bg-white px-3 py-2 text-xs">
                  <p className="truncate font-medium">knowledge.txt</p>
                  <p className="mt-0.5 text-[10px] text-black/40">標準ナレッジ</p>
                </div>
                {uploadedFiles.map((filename, index) => (
                  <div
                    className="rounded-lg border border-black/8 bg-white px-3 py-2 text-xs"
                    key={`${filename}-${index}`}
                  >
                    <p className="truncate font-medium">{filename}</p>
                    <p className="mt-0.5 text-[10px] text-black/40">アップロード済み · メモリ内</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[10px] leading-relaxed text-black/40">
                アップロード文書はこのプロセス内で共有され、再起動時に消去されます。
              </p>
            </div>
          </aside>

          <section className="flex min-h-[530px] flex-col">
            <div className="thin-scrollbar flex-1 overflow-y-auto px-5 py-8 sm:px-10">
              {messages.length === 0 ? (
                <div className="mx-auto flex min-h-[330px] max-w-lg flex-col justify-center">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/40">
                    {ragEnabled ? "Grounded conversation" : "Open conversation"}
                  </p>
                  <h2 className="mt-3 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
                    Ask with clarity.
                  </h2>
                  <p className="mt-4 max-w-md text-sm leading-7 text-black/55">
                    {ragEnabled
                      ? "knowledge.txt と追加した文書を検索し、関連する根拠とともに回答します。"
                      : "選択したモデルとの通常の会話モードです。ローカル文書は参照しません。"}
                  </p>
                  <div className="mt-7 flex flex-wrap gap-2">
                    {["サポート窓口の受付時間は？", "リリース前の確認事項は？"].map(
                      (suggestion) => (
                        <button
                          className="rounded-full border border-black/10 px-3 py-2 text-xs text-black/60 transition hover:border-black/35 hover:text-black"
                          key={suggestion}
                          onClick={() => setInput(suggestion)}
                          type="button"
                        >
                          {suggestion}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              ) : (
                <div className="mx-auto max-w-3xl space-y-7">
                  {messages.map((message) => (
                    <article
                      className={`flex gap-3 ${
                        message.role === "user" ? "justify-end" : "justify-start"
                      }`}
                      key={message.id}
                    >
                      {message.role === "assistant" && (
                        <div className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-black text-[10px] font-semibold text-white">
                          C
                        </div>
                      )}
                      <div
                        className={`max-w-[88%] ${
                          message.role === "user"
                            ? "rounded-2xl rounded-tr-sm bg-black px-4 py-3 text-white"
                            : "pt-1"
                        }`}
                      >
                        {message.content && (
                          <p className="whitespace-pre-wrap text-sm leading-7">
                            {message.content}
                          </p>
                        )}
                        {message.citations && message.citations.length > 0 && (
                          <div className="mt-4 border-t border-zinc-200 pt-3">
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-black/40">
                              Sources
                            </p>
                            <div className="space-y-2">
                              {message.citations.map((citation, index) => {
                                const isKnowledgeFile =
                                  citation.source === "knowledge.txt";
                                return (
                                  <details
                                    className="rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-2 text-xs"
                                    key={`${citation.source}-${index}`}
                                  >
                                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2">
                                      <span className="text-black/40">
                                        [{index + 1}]
                                      </span>
                                      <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-medium text-black/60">
                                        {isKnowledgeFile
                                          ? "📄 knowledge.txt"
                                          : "📁 Uploaded document"}
                                      </span>
                                      {!isKnowledgeFile && (
                                        <span className="font-medium text-black/70">
                                          {citation.source}
                                        </span>
                                      )}
                                    </summary>
                                    <p className="mt-2 leading-5 text-black/55">
                                      {citation.excerpt}
                                    </p>
                                  </details>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                  {isSending && (
                    <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-2 text-xs text-black/50">
                      <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-black/60 [animation-delay:-0.3s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-black/60 [animation-delay:-0.15s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-black/60" />
                      </span>
                      <span className="animate-fade-in" key={thinkingStatus ?? "default"}>
                        {thinkingStatus ?? "考えています…"}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-black/10 bg-white/70 p-4 sm:px-8 sm:py-5">
              {(error || notice) && (
                <div
                  className={`mx-auto mb-3 max-w-3xl rounded-lg px-3 py-2 text-xs ${
                    error
                      ? "border border-black/15 bg-[#f2f2f0] text-black"
                      : "bg-[#f2f2f0] text-black/65"
                  }`}
                  role={error ? "alert" : "status"}
                >
                  {error ?? notice}
                </div>
              )}
              <form className="mx-auto flex max-w-3xl gap-2" onSubmit={submitMessage}>
                <textarea
                  aria-label="メッセージ"
                  className="min-h-12 max-h-32 flex-1 resize-none rounded-xl border border-black/15 bg-[#fcfcfa] px-4 py-3 text-sm leading-5 placeholder:text-black/35"
                  disabled={isSending}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={onComposerKeyDown}
                  placeholder="メッセージを入力…"
                  rows={1}
                  value={input}
                />
                <button
                  aria-label="送信"
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-black text-white transition hover:bg-black/80 disabled:cursor-not-allowed disabled:bg-black/25"
                  disabled={!input.trim() || isSending}
                  type="submit"
                >
                  <SendIcon />
                </button>
              </form>
              <p className="mx-auto mt-2 max-w-3xl pl-1 text-[10px] text-black/35">
                Enter で送信 · Shift + Enter で改行
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
