# Context — ローカル RAG AI チャット

Next.js App Router、TypeScript、Tailwind CSS で作成した、ミニマルな AI チャットです。GPT、Gemini、Claude を切り替え、プロジェクト内のナレッジとアップロードした PDF を使う RAG（検索拡張生成）を利用できます。

## 必要要件

- Node.js 22.3 以降
- 利用するモデル提供者の API キー
- RAG を利用する場合は `OPENAI_API_KEY` または `GOOGLE_GENERATIVE_AI_API_KEY` のどちらか

Anthropic は埋め込みモデルを提供していないため、Claude を選んで RAG を使う場合も、OpenAI または Google の埋め込み用 API キーが必要です。

## セットアップ

```bash
npm install
Copy-Item .env.example .env.local
npm run dev
```

`.env.local` に、使うプロバイダーのキーを設定します。

```dotenv
OPENAI_API_KEY=...
GOOGLE_GENERATIVE_AI_API_KEY=...
ANTHROPIC_API_KEY=...
```

| モデル選択 | 必須の環境変数 | 使用モデル |
| --- | --- | --- |
| GPT | `OPENAI_API_KEY` | `gpt-4.1-mini` |
| Gemini | `GOOGLE_GENERATIVE_AI_API_KEY` | `gemini-2.5-flash` |
| Claude | `ANTHROPIC_API_KEY` | `claude-haiku-4-5` |

キーが設定されていないモデルを選択した場合は、画面に設定すべき環境変数を明示したエラーが表示されます。

## 使い方

1. 画面右上で GPT / Gemini / Claude を選びます。
2. **RAG ON** のとき、質問に近い文書の断片を検索して回答に渡します。回答の下に表示される **Sources** から参照内容を確認できます。
3. 左の **PDF を追加** から、テキストを含む 10 MB 以下の PDF を登録できます。
4. RAG をオフにすると、ローカル文書を参照しない通常の会話になります。

ルートの `knowledge.txt` には、問い合わせ、リリース、セキュリティ、PDF の扱いに関する日本語のサンプルを収録しています。内容を書き換えると、次回プロセス起動後の RAG ナレッジになります。

## RAG の構成

```text
knowledge.txt / PDF upload
           │
      text extraction
           │
   chunking + embedding
           │
 local in-memory vector store
           │
 cosine similarity top results
           │
 selected LLM + citations
```

- 起動後、最初に RAG を利用するタイミングで `knowledge.txt` を安全に読み込み、分割して埋め込みます。
- PDF は `pdf-parse` でテキストを抽出し、同じベクトルストアに追加します。
- 埋め込みは OpenAI を優先し、未設定なら Google を使います。プロセス内では単一の埋め込みモデルを一貫して使います。
- API はメッセージ件数・文字数、PDF 種別、サイズ、抽出テキストを検証します。PDF のファイル名は表示用に無害化します。

## 重要な制限

これはデモおよびローカル用途向けの**インメモリ**実装です。PDF とベクトルはディスクやデータベースへ保存されず、サーバーの再起動、ホットリロード、サーバーレスのインスタンス切り替えで失われます。また、アップロードした PDF は同一プロセスの利用者全員の検索対象になるため、機密情報をアップロードしないでください。本番環境では認可された永続ストレージとテナント分離されたベクトルデータベースに置き換えてください。

## 検証

```bash
npm run build
```