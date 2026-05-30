import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import type { PluginConfig } from './plugin-runner';
import type { ChatMessage } from './history';

export type CommandHandler = (args: string, messageHistory: ChatMessage[]) => void | Promise<void>;

export interface PluginSDK {
  registerCommand(name: string, handler: CommandHandler): void;
  getDataPath(pluginName: string): string;
  getConfig(pluginName: string): PluginConfig | null;
}

export class PluginHookManager {
  private static instance: PluginHookManager;
  private commands: Map<string, CommandHandler> = new Map();
  
  // Hooks
  private initHooks: ((sdk: PluginSDK) => void | Promise<void>)[] = [];
  private messageHooks: ((msg: ChatMessage, context: any) => void | Promise<void>)[] = [];
  private toolCallHooks: ((toolCall: any) => void | Promise<void>)[] = [];
  private exitHooks: (() => void | Promise<void>)[] = [];

  private constructor() {}

  public static getInstance(): PluginHookManager {
    if (!PluginHookManager.instance) {
      PluginHookManager.instance = new PluginHookManager();
    }
    return PluginHookManager.instance;
  }

  public registerCommand(name: string, handler: CommandHandler): void {
    this.commands.set(name.toLowerCase(), handler);
  }

  public getCommand(name: string): CommandHandler | undefined {
    return this.commands.get(name.toLowerCase());
  }

  public getRegisteredCommands(): string[] {
    return Array.from(this.commands.keys());
  }

  // Hook registration
  public addInitHook(hook: (sdk: PluginSDK) => void | Promise<void>) {
    this.initHooks.push(hook);
  }

  public addMessageHook(hook: (msg: ChatMessage, context: any) => void | Promise<void>) {
    this.messageHooks.push(hook);
  }

  public addToolCallHook(hook: (toolCall: any) => void | Promise<void>) {
    this.toolCallHooks.push(hook);
  }

  public addExitHook(hook: () => void | Promise<void>) {
    this.exitHooks.push(hook);
  }

  // Hook execution
  public async triggerInit(sdk: PluginSDK): Promise<void> {
    for (const hook of this.initHooks) {
      try {
        await hook(sdk);
      } catch (err) {
        console.error(`Error in onInit hook:`, err);
      }
    }
  }

  public async triggerMessage(msg: ChatMessage, context: any): Promise<void> {
    for (const hook of this.messageHooks) {
      try {
        await hook(msg, context);
      } catch (err) {
        console.error(`Error in onMessage hook:`, err);
      }
    }
  }

  public async triggerToolCall(toolCall: any): Promise<void> {
    for (const hook of this.toolCallHooks) {
      try {
        await hook(toolCall);
      } catch (err) {
        console.error(`Error in onToolCall hook:`, err);
      }
    }
  }

  public async triggerExit(): Promise<void> {
    for (const hook of this.exitHooks) {
      try {
        await hook();
      } catch (err) {
        console.error(`Error in onExit hook:`, err);
      }
    }
  }

  public clearAll(): void {
    this.commands.clear();
    this.initHooks = [];
    this.messageHooks = [];
    this.toolCallHooks = [];
    this.exitHooks = [];
  }
}

export function createSDK(pluginName: string, pluginDir: string, config: PluginConfig): PluginSDK {
  return {
    registerCommand(name: string, handler: CommandHandler): void {
      PluginHookManager.getInstance().registerCommand(name, handler);
    },
    getDataPath(name: string): string {
      // Return global/local depending on location configuration
      // Standard path is: pluginDir / (config['data-folder'] || 'data')
      const dataFolder = config['data-folder'] || 'data';
      return path.join(pluginDir, dataFolder);
    },
    getConfig(name: string): PluginConfig | null {
      return config;
    }
  };
}
