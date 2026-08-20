import { AIClient } from "./ai";
import { HistoryManager } from "./history";
import { ToolHandler, tools } from "../features/tools";
import fs from "fs-extra";
import os from "os";
import { SETTINGS_PATH, GET_CHATS_DIR, resolveWorkspace } from "./paths";

const toolHandler = new ToolHandler();

function getHistoryManager(): HistoryManager {
  const cwd = process.cwd();
  const workspace = resolveWorkspace(cwd, os.homedir());
  const chatsDir = workspace ? GET_CHATS_DIR(workspace) : undefined;
  return new HistoryManager(chatsDir);
}

export async function handleGUIChat(messages: any[]) {
    let settings: Record<string, unknown> = {};
    if (fs.existsSync(SETTINGS_PATH)) {
        try { settings = fs.readJsonSync(SETTINGS_PATH); } catch (e) { /* ignore */ }
    }

    const providerUrlMap: Record<string, string> = {
        openai: "https://api.openai.com/v1",
        gemini: "https://generativelanguage.googleapis.com/v1beta/openai/",
        deepseek: "https://api.deepseek.com/v1",
        qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        ollama: "http://localhost:11434/v1",
    };
    const aiProvider = (settings["AI Provider"] || "ollama") as string;
    const aiClient = new AIClient({
        model: (settings["Default AI Model"] as string) || "gpt-oss:20b-cloud",
        baseUrl: providerUrlMap[aiProvider] || "http://localhost:11434/v1",
        apiKey: (settings["API Key"] as string) || undefined,
    });

    const workspace = resolveWorkspace(process.cwd(), require("os").homedir());
    toolHandler.setWorkspace(workspace);

    let currentMessages = [...messages];

    while (true) {
        const response = await aiClient.chat(currentMessages, tools);

        if (response.tool_calls && response.tool_calls.length > 0) {
            currentMessages.push(response);

            for (const toolCall of response.tool_calls) {
                let result = "";
                try {
                    const fn = (toolCall as any).function;
                    result = await toolHandler.execute(
                        fn.name,
                        JSON.parse(fn.arguments)
                    );
                } catch (e: unknown) {
                    result = `Error: ${(e as any)?.message || String(e)}`;
                }

                currentMessages.push({
                    role: "tool",
                    tool_call_id: toolCall.id,
                    content: result
                });
            }
        } else {
            return response;
        }
    }
}

export async function getGUIHistory() {
    return await getHistoryManager().listChats();
}

export async function loadGUIChat(id: string) {
    return await getHistoryManager().loadChat(id);
}
