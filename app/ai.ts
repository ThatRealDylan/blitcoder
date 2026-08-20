import OpenAI from "openai";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { GLOBAL_DIR } from "./paths";

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
  const globalPrompt = path.join(GLOBAL_DIR, "system_prompt.txt");
  const localPrompt = path.join(process.cwd(), ".blitcoder", "system_prompt.txt");

  for (const promptPath of [globalPrompt, localPrompt]) {
    try {
      if (existsSync(promptPath)) {
        return readFileSync(promptPath, "utf-8");
      }
    } catch (e) { /* try next */ }
  }

  return "You are a helpful coding assistant.";
}
