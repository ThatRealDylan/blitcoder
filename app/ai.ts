import OpenAI from "openai";
import { readFileSync } from "fs";
import path from "path";

export type ModelType = "DeepSeek" | "GPT-OSS" | "Local Model" | string;

export interface AIConfig {
  model: ModelType;
  apiKey?: string;
  baseUrl?: string;
  localModelPath?: string;
}

export class AIClient {
  private client: OpenAI;
  private model: string;

  constructor(config: AIConfig) {
    this.model = config.model;
    const baseURL = config.baseUrl || this.getDefaultBaseUrl(config.model);
    let apiKey = config.apiKey || process.env.OPENAI_API_KEY;

    if (config.model === "DeepSeek" && process.env.DEEPSEEK_API_KEY) {
      apiKey = process.env.DEEPSEEK_API_KEY;
    }

    apiKey = apiKey || "sk-dummy";

    this.client = new OpenAI({
      baseURL,
      apiKey,
    });
  }

  private getDefaultBaseUrl(model: ModelType): string {
    if (model === "DeepSeek") return "https://api.deepseek.com/v1";
    return "http://localhost:11434/v1";
  }

  async chat(messages: OpenAI.Chat.ChatCompletionMessageParam[], tools?: OpenAI.Chat.ChatCompletionTool[]) {
    const response = await this.client.chat.completions.create({
      model: this.getActualModelName(this.model),
      messages,
      tools,
      tool_choice: tools ? "auto" : undefined,
    });

    const choice = response.choices[0];
    if (!choice) throw new Error("No response from model");
    return choice.message;
  }

  private getActualModelName(model: ModelType): string {
    if (model === "DeepSeek") return "deepseek-coder";
    if (model === "Local Model") return "local-model";
    return model;
  }
}

export function getSystemPrompt(): string {
  try {
    return readFileSync(path.join(process.cwd(), ".blitcoder", "system_prompt.txt"), "utf-8");
  } catch (e) {
    return "You are a helpful coding assistant.";
  }
}