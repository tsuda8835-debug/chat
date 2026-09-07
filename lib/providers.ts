import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export const modelIds = ["gpt", "gemini", "claude"] as const;
export type ChatModelId = (typeof modelIds)[number];

export class ProviderConfigurationError extends Error {
  constructor(provider: string, variable: string) {
    super(
      `${provider} を利用するには、サーバー環境変数 ${variable} を設定してください。`,
    );
    this.name = "ProviderConfigurationError";
  }
}

export function getLanguageModel(id: ChatModelId): LanguageModel {
  switch (id) {
    case "gpt":
      if (!process.env.OPENAI_API_KEY) {
        throw new ProviderConfigurationError("GPT", "OPENAI_API_KEY");
      }
      return openai("gpt-4.1-mini");
    case "gemini":
      if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
        throw new ProviderConfigurationError(
          "Gemini",
          "GOOGLE_GENERATIVE_AI_API_KEY",
        );
      }
      return google("gemini-2.5-flash");
    case "claude":
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new ProviderConfigurationError("Claude", "ANTHROPIC_API_KEY");
      }
      return anthropic("claude-haiku-4-5");
  }
}
