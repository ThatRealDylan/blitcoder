import fs from "fs-extra";
import path from "path";
import { v4 as uuidv4 } from "uuid";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: any[];
  tool_call_id?: string;
  tool_name?: string;
  tool_args?: string;
  isLog?: boolean;
}

export interface ChatSession {
  id: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export class HistoryManager {
  private baseDir: string;
  private currentChatId: string;

  constructor(customDir?: string) {
    this.baseDir = customDir || path.join(process.cwd(), ".blitcoder", "chats");
    fs.ensureDirSync(this.baseDir);
    this.currentChatId = uuidv4();
  }

  setCurrentChat(id: string) {
    this.currentChatId = id;
  }

  async saveChat(messages: ChatMessage[], memory?: any) {
    const chatDir = path.join(this.baseDir, this.currentChatId);
    await fs.ensureDir(chatDir);
    
    const session: ChatSession = {
      id: this.currentChatId,
      messages,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await fs.writeJson(path.join(chatDir, "chat.json"), session, { spaces: 2 });
    
    if (memory) {
      await fs.writeJson(path.join(chatDir, "memory.json"), memory, { spaces: 2 });
    }
  }

  async loadMemory(id: string): Promise<any> {
    const memoryFile = path.join(this.baseDir, id, "memory.json");
    if (await fs.pathExists(memoryFile)) {
      return await fs.readJson(memoryFile);
    }
    return {};
  }

  async loadChat(id: string): Promise<ChatSession | null> {
    const chatFile = path.join(this.baseDir, id, "chat.json");
    if (await fs.pathExists(chatFile)) {
      return await fs.readJson(chatFile);
    }
    return null;
  }

  async listChats(): Promise<{ id: string, updatedAt: string, title?: string }[]> {
    if (!(await fs.pathExists(this.baseDir))) return [];
    const folders = await fs.readdir(this.baseDir);
    const chats = [];
    for (const folder of folders) {
      const chatFile = path.join(this.baseDir, folder, "chat.json");
      if (await fs.pathExists(chatFile)) {
        const stats = await fs.stat(chatFile);
        const data = await fs.readJson(chatFile);
        const firstMsg = data.messages.find((m: any) => m.role === 'user')?.content || 'Empty Chat';
        chats.push({ 
          id: folder, 
          updatedAt: stats.mtime.toISOString(),
          title: firstMsg.substring(0, 30) + (firstMsg.length > 30 ? '...' : '')
        });
      }
    }
    return chats.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  getCurrentChatId() {
    return this.currentChatId;
  }
}
