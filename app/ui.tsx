import React, { useState, useEffect, useMemo } from 'react';
import { render, Text, Box, useInput, useApp, Static, Transform } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { AIClient, getSystemPrompt } from './ai';
import { HistoryManager } from './history';
import type { ChatMessage } from './history';
import { ToolHandler, tools } from '../features/tools';

import { ensureOllama, killOllama } from "./ollama";
import { SETTINGS_PATH, MEMORY_PATH, BIN_DIR, LOCAL_MODELS_PATH, GET_CHATS_DIR } from "./paths";
import { spawn } from "child_process";
import { PluginCreateMenu, PluginImportMenu, PluginFeaturedMenu } from "./plugin-ui";
import { initPlugins, runPluginScripts, discoverPlugins, formatPluginList, formatScriptResults, loadAllPluginMods } from "./plugin-runner";
import type { LoadedPlugin } from "./plugin-runner";
import { PluginHookManager } from "./plugin-hooks";
import { checkForUpdates } from "./autoupdate";
import { SetupWizard } from "./setup-wizard";


export interface AppProps {
  initialWorkspace?: string | null;
  initialPluginMode?: 'create' | 'import' | 'featured' | null;
  mode?: 'chat' | 'setup';
}

const getInitialSettings = () => {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return fs.readJsonSync(SETTINGS_PATH);
    }
  } catch (e) { }
  return null;
};

const child = spawn('title', ['blitCoder'], {
  shell: true,
  stdio: 'inherit'
});

const App = ({ initialWorkspace = null, initialPluginMode = null, mode: initialMode = 'chat' }: AppProps) => {
  const initialSettings = React.useMemo(getInitialSettings, []);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [history, setHistory] = useState<HistoryManager | null>(null);
  const [toolHandler] = useState(new ToolHandler());
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [currentModel, setCurrentModel] = useState(initialSettings?.['Default AI Model'] && initialSettings?.['Default AI Model'] !== 'None' ? initialSettings['Default AI Model'] : 'None');
  const [terminalSize, setTerminalSize] = useState({ columns: process.stdout.columns, rows: process.stdout.rows });
  const [pendingAction, setPendingAction] = useState<{ toolCall: any, toolMsgs: ChatMessage[] } | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [workspace, setWorkspace] = useState<string | null>(initialWorkspace);
  const [showSettings, setShowSettings] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [viewingContent, setViewingContent] = useState<string | null>(null);
  const [pluginMode, setPluginMode] = useState<'create' | 'import' | 'featured' | null>(initialPluginMode);
  const [loadedPlugins, setLoadedPlugins] = useState<LoadedPlugin[]>([]);
  const [injectedComponents, setInjectedComponents] = useState<Record<string, React.ComponentType<any>>>({});
  const [showLogo, setShowLogo] = useState(true);
  const [appMode, setAppMode] = useState<'chat' | 'setup'>(initialMode);
  const { exit } = useApp();
  const handleExit = async () => {
    try {
      await PluginHookManager.getInstance().triggerExit();
    } catch (e) {}
    exit();
  };
  const asciiLogo = React.useMemo(() => {
    try {
      const content = fs.readFileSync(path.join(__dirname, "ascii.txt"), "utf-8");
      const lines = content.split("\n");
      return { green: lines.slice(0, 3), blue: lines.slice(3, 6) };
    } catch { return null; }
  }, []);

  const aiClient = React.useMemo(() => {
    const providerUrlMap: Record<string, string> = {
      openai: "https://api.openai.com/v1",
      gemini: "https://generativelanguage.googleapis.com/v1beta/openai/",
      deepseek: "https://api.deepseek.com/v1",
      qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      ollama: "http://localhost:11434/v1",
    };
    const provider = (initialSettings?.["AI Provider"] || "ollama") as string;
    return new AIClient({
      model: currentModel,
      baseUrl: providerUrlMap[provider] || "http://localhost:11434/v1",
      apiKey: initialSettings?.["API Key"] || undefined,
    });
  }, [currentModel, initialSettings]);

  useEffect(() => {
    const h = new HistoryManager(initialWorkspace ? GET_CHATS_DIR(initialWorkspace) : undefined);
    setHistory(h);

    if (initialWorkspace) {
      toolHandler.setWorkspace(initialWorkspace);
    }
    const sysPrompt = initialSettings?.['System Prompt'] || getSystemPrompt();
    setMessages([{ role: 'system', content: sysPrompt }]);

    const onResize = () => {
      setTerminalSize({ columns: process.stdout.columns, rows: process.stdout.rows });
    };
    process.stdout.on('resize', onResize);

    // Auto-discover and run all installed plugin scripts on startup
    initPlugins().then(async ({ plugins, scriptResults }) => {
      setLoadedPlugins(plugins);
      try {
        const comps = await loadAllPluginMods(plugins);
        setInjectedComponents(comps);
      } catch (e) {}

      // Check for updates
      checkForUpdates().then((update) => {
        if (update && update.hasUpdate) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `🔔 A new version of BlitCoder is available: v${update.latestVersion} (current: v${update.currentVersion}). Please update!`,
            isLog: true
          }]);
        }
      }).catch(() => {});

      if (plugins.length > 0) {
        let showPluginSuccess = 'ON';
        try {
          if (fs.existsSync(SETTINGS_PATH)) {
            const s = fs.readJsonSync(SETTINGS_PATH);
            if (s["Plugin Success Text"] === 'OFF') showPluginSuccess = 'OFF';
          }
        } catch (e) {}
        if (showPluginSuccess === 'ON') {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `🔌 Plugins: ${plugins.length} active`,
            isLog: true
          }]);
        }
      }
    }).catch(() => {});

    return () => {
      process.stdout.off('resize', onResize);
    };
  }, []);



  useInput((inputStr, key) => {
    if (showLogo && !(key.shift && key.tab)) {
      setShowLogo(false);
    }
    if (showSettings) return;
    if (key.ctrl && inputStr === 'c') {
      handleExit();
    }
    if (key.ctrl && inputStr === 'l') {
      setMessages([{ role: 'system', content: getSystemPrompt() }]);
    }
    if (key.upArrow) {
      setScrollOffset(prev => prev + 1);
    }
    if (key.downArrow) {
      setScrollOffset(prev => Math.max(0, prev - 1));
    }
    if (key.shift && key.tab) {
      handleSettings();
    }
    if (showSessions) {
      if (key.escape) setShowSessions(false);
      return;
    }
    if (viewingContent !== null) {
      if (key.escape) setViewingContent(null);
      if (key.upArrow) setScrollOffset(prev => prev + 1);
      if (key.downArrow) setScrollOffset(prev => Math.max(0, prev - 1));
      return;
    }
    if (pendingAction) {
      if (inputStr.toLowerCase() === 'y') confirmAction(true);
      if (inputStr.toLowerCase() === 'n') confirmAction(false);
    }
  });

  const handleSubmit = async () => {
    if (!input.trim()) return;

    if (input.startsWith('/')) {
      await handleCommand(input);
      setInput('');
      return;
    }

    const newUserMsg: ChatMessage = { role: 'user', content: input };
    const updatedMessages = [...messages, newUserMsg];
    
    // Trigger onMessage hook
    try {
      await PluginHookManager.getInstance().triggerMessage(newUserMsg, { workspace, currentModel });
    } catch (e) {}

    setMessages(updatedMessages);
    setInput('');
    setScrollOffset(0); // Reset scroll on new message
    setIsTyping(true);

    try {
      await processAIResponse(updatedMessages);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${(error as any).message || error}` }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleCommand = async (cmd: string) => {
    const [command, ...args] = cmd.slice(1).split(' ');
    if (!command) return;

    // Check if plugin registered a command handler
    const hookMgr = PluginHookManager.getInstance();
    const pluginCmdHandler = hookMgr.getCommand(command);
    if (pluginCmdHandler) {
      try {
        await pluginCmdHandler(args.join(' '), messages);
      } catch (err: any) {
        setMessages(prev => [...prev, { role: 'assistant', content: `Error running plugin command /${command}: ${(err as any)?.message || err}` }]);
      }
      return;
    }

    switch (command) {
      case 'help':
        setMessages(prev => [...prev, { role: 'assistant', content: 'Commands: /help, /clear, /exit, /model <model>, /whichmodel, /upload <path>, /dir <path>, /localmodel <new|edit|delete> <name> <path>, /plugin <create|import|list|run [name]>' }]);
        break;
      case 'clear':
        setMessages([{ role: 'system', content: getSystemPrompt() }]);
        break;
      case 'exit':
        await handleExit();
        break;
      case 'plugin':
        if (args[0] === 'create') {
          setPluginMode('create');
        } else if (args[0] === 'import') {
          setPluginMode('import');
        } else if (args[0] === 'list') {
          const fresh = discoverPlugins();
          setLoadedPlugins(fresh);
          setMessages(prev => [...prev, { role: 'assistant', content: `🔌 Installed Plugins:\n${formatPluginList(fresh)}` }]);
        } else if (args[0] === 'run') {
          const pluginName = args.slice(1).join(' ');
          const pluginsToRun = pluginName
            ? loadedPlugins.filter(p => p.name.toLowerCase() === pluginName.toLowerCase())
            : loadedPlugins;
          if (pluginsToRun.length === 0) {
            setMessages(prev => [...prev, { role: 'assistant', content: pluginName ? `Plugin "${pluginName}" not found. Use /plugin list to see installed plugins.` : 'No plugins loaded.' }]);
          } else {
            setMessages(prev => [...prev, { role: 'assistant', content: `▶️ Running scripts for: ${pluginsToRun.map(p => p.name).join(', ')}...`, isLog: true }]);
            Promise.all(pluginsToRun.map(p => runPluginScripts(p)))
              .then(allResults => {
                const flat = allResults.flat();
                setMessages(prev => [...prev, { role: 'assistant', content: formatScriptResults(flat), isLog: true }]);
              })
              .catch(err => {
                setMessages(prev => [...prev, { role: 'assistant', content: `Script run error: ${(err as any)?.message || err}` }]);
              });
          }
        } else {
          setMessages(prev => [...prev, { role: 'assistant', content: 'Usage: /plugin <create|import|list|run [name]>' }]);
        }
        break;
      case 'model':
        if (args[0] === 'list') {
          const cloudModels = ['Deepseek-v3.5:671b-cloud', 'gpt-oss:20b-cloud', 'gpt-oss:120b-cloud', 'qwen3.5:397b-cloud', 'gemma4:31b-cloud', 'minimax-m2.7:cloud'];
          let localStr = 'None';
          try {
            if (fs.existsSync(LOCAL_MODELS_PATH)) {
              const localModels = fs.readJsonSync(LOCAL_MODELS_PATH);
              const keys = Object.keys(localModels);
              if (keys.length > 0) localStr = keys.join(', ');
            }
          } catch (e) { }
          setMessages(prev => [...prev, { role: 'assistant', content: `Available Cloud Models: \n- ${cloudModels.join('\n- ')}\n\nAvailable Local Models: ${localStr}` }]);
        } else {
          setCurrentModel(args[0] || 'DeepSeek');
          setMessages(prev => [...prev, { role: 'assistant', content: `Model set to ${args[0] || 'DeepSeek'}` }]);
        }
        break;
      case 'whichmodel':
        setMessages(prev => [...prev, { role: 'assistant', content: `Current model: ${currentModel}` }]);
        break;
      case 'view':
        const lastToolMsg = [...messages].reverse().find(m => m.role === 'tool' || (m.role === 'assistant' && m.isLog));
        if (lastToolMsg && lastToolMsg.content) {
          setViewingContent(lastToolMsg.content);
          setScrollOffset(0);
        } else {
          setMessages(prev => [...prev, { role: 'assistant', content: 'No tool output found to view.' }]);
        }
        break;
      case 'sessions':
        setShowSessions(true);
        break;
      case 'upload':
        handleUpload(args[0] || '');
        break;
      case 'dir':
        const dirPath = args.join(' ');
        if (!dirPath) {
          setMessages(prev => [...prev, { role: 'assistant', content: 'Usage: /dir <path>' }]);
        } else {
          setWorkspace(dirPath);
          toolHandler.setWorkspace(dirPath);
          setMessages(prev => [...prev, { role: 'assistant', content: `Workspace set to: ${dirPath} (Sandboxed Mode)` }]);
        }
        break;
      case 'localmodel':
        handleLocalModel(args);
        break;
      case 'settings':
        handleSettings();
        break;
      default:
        setMessages(prev => [...prev, { role: 'assistant', content: `Unknown command: ${command}` }]);
    }
  };

  const handleSettings = async () => {
    try {
      if (!fs.existsSync(SETTINGS_PATH)) {
        const defaultSettings = {
          "System Prompt": getSystemPrompt(),
          "Keyboard Shortcuts": {
            "exit": "ctrl+c",
            "clear": "ctrl+l",
            "upload": "ctrl+shift+u",
            "shortcuts": "shift+tab"
          },
          "Memory": {},
          "Default AI Model": "None",
          "Ollama": "existing",
          "Dynamic Truncation": "ON"
        };
        await fs.outputJson(SETTINGS_PATH, defaultSettings, { spaces: 2 });
      }
    } catch (e) { }
    setShowSettings(true);
  };

  const handleLocalModel = async (args: string[]) => {
    const [action, name, ggufPath] = args;
    if (!action || !name) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Usage: /localmodel <new|edit|delete> <name> [path]' }]);
      return;
    }

    // In a real app we'd save this to .blitcoder/local_models.json
    // and maybe run `ollama create` or similar. For now, we mock the success.
    if (action === 'new' || action === 'edit') {
      setMessages(prev => [...prev, { role: 'assistant', content: `Successfully ${action === 'new' ? 'added' : 'updated'} local model '${name}' at ${ggufPath}` }]);
    } else if (action === 'delete') {
      setMessages(prev => [...prev, { role: 'assistant', content: `Successfully removed local model '${name}' from selection list.` }]);
    }
  };

  const handleUpload = async (filePath: string) => {
    if (!filePath) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Usage: /upload <path>' }]);
      return;
    }
    try {
      const content = await toolHandler.execute('read_file', { path: filePath });
      setMessages(prev => [...prev, { role: 'user', content: `Uploaded file ${filePath}:\n\n${content}` }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error uploading file: ${(e as any).message || e}` }]);
    }
  };

  const processAIResponse = async (currentMsgs: ChatMessage[]) => {
    const response = await aiClient.chat(currentMsgs as any, tools);

    if (response.tool_calls) {
      const toolMsgs = [...currentMsgs, response as ChatMessage];

      for (const toolCall of (response.tool_calls as any[])) {
        if (toolCall.function.name === 'run_command' || toolCall.function.name === 'delete_file') {
          setPendingAction({ toolCall, toolMsgs });
          return; // Wait for user input
        }

        // Trigger onToolCall hook
        try {
          await PluginHookManager.getInstance().triggerToolCall(toolCall);
        } catch (e) {}

        const result = await toolHandler.execute(toolCall.function.name, JSON.parse(toolCall.function.arguments));
        toolMsgs.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          tool_name: toolCall.function.name,
          tool_args: toolCall.function.arguments,
          content: result
        });

        const newLogs = toolHandler.getLogs();
        newLogs.forEach(log => {
          toolMsgs.push({ role: 'assistant', content: log, isLog: true });
        });
      }

      setMessages(toolMsgs);
      await processAIResponse(toolMsgs);
    } else {
      setMessages(prev => [...prev, response as ChatMessage]);
      await history?.saveChat([...currentMsgs, response as ChatMessage]);
    }
  };

  const confirmAction = async (approved: boolean) => {
    if (!pendingAction) return;

    const { toolCall, toolMsgs } = pendingAction;
    setPendingAction(null);

    if (approved) {
      // Trigger onToolCall hook
      try {
        await PluginHookManager.getInstance().triggerToolCall(toolCall);
      } catch (e) {}

      const result = await toolHandler.execute(toolCall.function.name, JSON.parse(toolCall.function.arguments));
      const updatedToolMsgs = [...toolMsgs, {
        role: 'tool' as const,
        tool_call_id: toolCall.id,
        tool_name: toolCall.function.name,
        tool_args: toolCall.function.arguments,
        content: result
      }];

      const newLogs = toolHandler.getLogs();
      newLogs.forEach(log => {
        updatedToolMsgs.push({ role: 'assistant', content: log, isLog: true });
      });

      setMessages(updatedToolMsgs);
      await processAIResponse(updatedToolMsgs);
    } else {
      const updatedToolMsgs = [...toolMsgs, {
        role: 'tool' as const,
        tool_call_id: toolCall.id,
        content: "User denied the action."
      }];
      setMessages(updatedToolMsgs);
      await processAIResponse(updatedToolMsgs);
    }
  };

  const FileViewer = ({ content, onExit }: { content: string, onExit: () => void }) => {
    const lines = content.split('\n');
    const maxLines = terminalSize.rows - 4;
    const startIdx = Math.max(0, lines.length - maxLines - scrollOffset);
    const safeWidth = Math.max(5, terminalSize.columns - 2);
    const visibleLines = lines.slice(startIdx, startIdx + maxLines).map(line => {
      const cleanLine = (line || ' ').replace(/\t/g, '    ');
      return cleanLine.length > safeWidth ? cleanLine.substring(0, safeWidth - 3) + '...' : cleanLine;
    });

    return (
      <Box
        flexDirection="column"
        height={terminalSize.rows}
        width={terminalSize.columns}
        backgroundColor="black"
      >
        <Box backgroundColor="yellow" paddingX={1} width="100%">
          <Text color="black" bold>📄 File Viewer [v2] (Esc to exit) — {lines.length} lines</Text>
        </Box>

        <Box flexDirection="column" flexGrow={1} paddingX={1}>
          {visibleLines.map((line, i) => (
            <Text key={i} wrap="truncate-end" color="white">{line}</Text>
          ))}
        </Box>

        <Box backgroundColor="gray" paddingX={1} width="100%">
          <Text color="white">Use Arrow Keys to Scroll | ↑/↓ to move</Text>
        </Box>
      </Box>
    );
  };


  const StatusBar = () => (
    <Box
      width="100%"
      paddingX={1}
      borderStyle="single"
      borderColor="gray"
      flexDirection="row"
      justifyContent="space-between"
    >
      <Box>
        <Text color="cyan" bold>🚀 BlitCoder</Text>
        <Text color="gray"> | </Text>
        <Text color="blue">Model: </Text>
        <Text color="white">{currentModel}</Text>
        {loadedPlugins.length > 0 && (
          <>
            <Text color="gray"> | </Text>
            <Text color="magenta">🔌 {loadedPlugins.length} plugin{loadedPlugins.length > 1 ? 's' : ''}</Text>
          </>
        )}
      </Box>
      <Box>
        <Text color="gray">Workspace: </Text>
        <Text color="yellow">{workspace ? path.basename(workspace) : 'Global'}</Text>
      </Box>
    </Box>
  );

  const SessionsMenu = ({ onExit }: { onExit: () => void }) => {
    const [chats, setChats] = useState<{ id: string, updatedAt: string, title?: string }[]>([]);

    useEffect(() => {
      if (history) {
        history.listChats().then(setChats);
      }
    }, []);

    const handleSelect = async (item: any) => {
      if (item.value === 'exit') {
        onExit();
      } else {
        const chat = await history!.loadChat(item.value);
        if (chat) {
          history!.setCurrentChat(item.value);
          setMessages(chat.messages);
          onExit();
        }
      }
    };

    const items = useMemo(() => [
      ...chats.map(c => ({
        label: `${new Date(c.updatedAt).toLocaleDateString()} | ${c.title || c.id}`,
        value: c.id
      })),
      { label: 'Back', value: 'exit' }
    ], [chats]);

    return (
      <Box flexDirection="column" height={terminalSize.rows - 1} width={terminalSize.columns} padding={1}>
        <Text bold color="magenta">💾 Session Manager</Text>
        <Text color="gray" dimColor>(Select a session to resume)</Text>
        <Box marginTop={1} flexDirection="column">
          <SelectInput items={items} onSelect={handleSelect} />
        </Box>
      </Box>
    );
  };

  if (appMode === 'setup') {
    return (
      <SetupWizard onComplete={(setupData) => {
        const settings: any = {
          "System Prompt": setupData.systemPrompt || getSystemPrompt(),
          "Keyboard Shortcuts": {
            "exit": "ctrl+c",
            "clear": "ctrl+l",
            "upload": "ctrl+shift+u",
            "shortcuts": "shift+tab",
          },
          "Memory": {},
          "AI Provider": setupData.aiProvider || 'skip',
          "API Key": setupData.apiKey || '',
          "Default AI Model": setupData.defaultModel || 'None',
          "Ollama": setupData.ollama || 'existing',
          "Dynamic Truncation": setupData.truncation === 'on+' ? 'ON+' : setupData.truncation === 'on' ? 'ON' : 'OFF',
        };
        try {
          fs.outputJsonSync(SETTINGS_PATH, settings, { spaces: 2 });
        } catch (e) {}
        setAppMode('chat');
      }} />
    );
  }

  if (viewingContent) {
    return <FileViewer content={viewingContent} onExit={() => setViewingContent(null)} />;
  }

  if (showSessions) {
    return <SessionsMenu onExit={() => setShowSessions(false)} />;
  }

  if (showSettings) {
    return <SettingsMenu onExit={() => setShowSettings(false)} terminalSize={terminalSize} injectedComponents={injectedComponents} onFeaturedPlugins={() => { setShowSettings(false); setPluginMode('featured'); }} />;
  }

  if (pluginMode === 'create') {
    return <PluginCreateMenu onExit={() => setPluginMode(null)} />;
  }

  if (pluginMode === 'import') {
    return <PluginImportMenu onExit={() => setPluginMode(null)} />;
  }

  if (pluginMode === 'featured') {
    return <PluginFeaturedMenu onExit={() => setPluginMode(null)} />;
  }

  return (
    <Box flexDirection="column" height={terminalSize.rows - 1} width={terminalSize.columns}>
      <StatusBar />
      {showLogo && asciiLogo && (
        <Box flexDirection="column" paddingX={1} marginBottom={1}>
          {asciiLogo.green.map((l, i) => <Text key={`g${i}`} color="green">{l}</Text>)}
          {asciiLogo.blue.map((l, i) => <Text key={`b${i}`} color="blue">{l}</Text>)}
        </Box>
      )}
      <Box flexGrow={1} flexDirection="column" paddingX={1} marginTop={0} overflowY="hidden" justifyContent="flex-end">
        {!workspace && (
          <Box marginBottom={1}>
            <Text color="yellow">⚠️  Warning: Running in Unsandboxed mode. Use /dir &lt;path&gt; to set a workspace.</Text>
          </Box>
        )}
        {/* Render visible lines to perfectly fit the screen and avoid Ink overflow glitches */}
        {(() => {
          const displayMsgs = messages.filter(m => m.role !== 'system');

          // Custom word-wrapper to perfectly predict terminal layout
          const columns = terminalSize.columns || 80;
          const wrapText = (text: string) => {
            const result: string[] = [];
            let currentLine = '';
            const words = text.split(' ');

            for (const word of words) {
              if (currentLine.length + word.length + (currentLine.length > 0 ? 1 : 0) <= columns) {
                currentLine += (currentLine.length > 0 ? ' ' : '') + word;
              } else {
                if (currentLine) result.push(currentLine);
                let remainingWord = word;
                while (remainingWord.length > columns) {
                  result.push(remainingWord.substring(0, columns));
                  remainingWord = remainingWord.substring(columns);
                }
                currentLine = remainingWord;
              }
            }
            if (currentLine) result.push(currentLine);
            return result.length > 0 ? result : [''];
          };

          // Flatten messages into physical lines with their role attached
          const allLines: { role: string, text: string }[] = [];
          displayMsgs.forEach(msg => {
            let content = msg.content || '';
            const truncationMode = initialSettings?.['Dynamic Truncation'] || 'ON';

            if (msg.role === 'tool' && truncationMode !== 'OFF') {
              const lines = content.split(/\r?\n/);
              if (lines.length > 5) {
                let summary = 'Tool output';
                try {
                  const name = msg.tool_name || '';
                  const args = JSON.parse(msg.tool_args || '{}');
                  if (name === 'read_file') summary = `Read ${args.path}`;
                  else if (name === 'list_dir') summary = `Listed ${args.path}`;
                  else if (name === 'run_command') summary = `Ran ${args.command}`;
                  else if (name === 'search_web') summary = `Searched ${args.query}`;
                  else if (name === 'grep_search') summary = `Grepped ${args.query}`;
                  else summary = `${name} output`;
                } catch (e) { }

                content = truncationMode === 'ON'
                  ? `${summary}... [Type /view to expand]`
                  : `${summary}...`;
              }
            }

            const lines = content.split(/\r?\n/);
            lines.forEach((line, i) => {
              const prefix = msg.isLog ? '' : (i === 0 ? `[${msg.role === 'user' ? 'User' : 'BlitCoder'}] ` : '  ');
              const wrapped = wrapText(prefix + line);
              wrapped.forEach(w => allLines.push({ role: msg.isLog ? 'log' : msg.role, text: w }));
            });
          });

          // Calculate how many lines we can safely show based on how tall the input box is right now
          const inputRows = wrapText('❯ ' + input).length;
          const maxVisibleLines = Math.max(3, terminalSize.rows - 6 - inputRows);

          const startIdx = Math.max(0, allLines.length - maxVisibleLines - scrollOffset);
          const visibleLines = allLines.slice(startIdx, startIdx + maxVisibleLines);

          return visibleLines.map((lineObj, index) => {
            let color = 'white';
            if (lineObj.role === 'log') color = 'yellow';
            else if (lineObj.role === 'user') color = 'blue';
            else if (lineObj.role === 'assistant') color = 'green';
            else if (lineObj.role === 'tool') color = 'gray';

            return (
              <Box key={`line-${startIdx + index}`} marginBottom={0} width="100%">
                <Text color={color}>
                  {lineObj.text}
                </Text>
              </Box>
            );
          });
        })()}

        {isTyping && (
          <Box>
            <Text color="gray"><Spinner type="dots" /> BlitCoder is thinking...</Text>
          </Box>
        )}
        {pendingAction && (
          <Box flexDirection="column" borderStyle="double" borderColor="yellow" padding={1}>
            <Text bold color="yellow">⚠️ DANGEROUS ACTION REQUESTED</Text>
            <Text>Tool: {pendingAction.toolCall.function.name}</Text>
            <Text>Args: {pendingAction.toolCall.function.arguments}</Text>
            <Box marginTop={1}>
              <Text>Press <Text bold color="green">Y</Text> to approve or <Text bold color="red">N</Text> to deny.</Text>
            </Box>
          </Box>
        )}
      </Box>

      <Box flexDirection="row" paddingX={1} marginTop={1}>
        <Text color="cyan">❯ </Text>
        <TextInput value={input} onChange={setInput} onSubmit={handleSubmit} />
      </Box>

      <Box paddingX={1} paddingBottom={1}>
        <Text color="gray">Ctrl+C: Exit | Ctrl+L: Clear | /help: Commands</Text>
      </Box>
    </Box>
  );
};

const FEATURED_PLUGINS = [
  { label: 'blitgui', value: 'blitgui', size: '12.4MB', description: '# BlitCoder GUI\nThe GUI we implemented now as a Plugin.' },
  { label: 'extra-api', value: 'extra-apis', size: '2.1MB', description: '# Extra API\nUse API Keys to communicate with more cloud models.' },
  { label: 'integrated-fs', value: 'integrated-fs', size: '4.5MB', description: '# Integrated FS\nAdds new commands to Manage your Workspace directly such as creating files and folders.' }
];

// Helper to query which plugins (featured and custom) are currently in the installation directory
const getInstalledPluginKeys = (): string[] => {
  try {
    let settings: any = {};
    if (fs.existsSync(SETTINGS_PATH)) {
      settings = fs.readJsonSync(SETTINGS_PATH);
    }
    let targetDir = path.join(process.cwd(), '.blitcoder', 'plugins');
    if (settings["Plugin Install Location"] === "User folder") {
      targetDir = path.join(os.homedir(), '.blitcoder', 'plugins');
    }
    if (fs.existsSync(targetDir)) {
      return fs.readdirSync(targetDir).filter(f => fs.statSync(path.join(targetDir, f)).isDirectory());
    }
  } catch (e) {}
  return [];
};

// Helper to query all custom (non-featured) directories in user/local plugins directory
const getCustomPlugins = (): { label: string; value: string; size: string; description: string; isCustom: boolean }[] => {
  const installed = getInstalledPluginKeys();
  const featuredKeys = FEATURED_PLUGINS.map(p => p.value);
  const customKeys = installed.filter(k => !featuredKeys.includes(k));

  return customKeys.map(k => {
    let desc = `# Custom Plugin: ${k}\nAn imported or custom-created BlitCoder plugin.`;
    let version = '1.0.0';
    try {
      let settings: any = {};
      if (fs.existsSync(SETTINGS_PATH)) settings = fs.readJsonSync(SETTINGS_PATH);
      let targetDir = path.join(process.cwd(), '.blitcoder', 'plugins');
      if (settings["Plugin Install Location"] === "User folder") {
        targetDir = path.join(os.homedir(), '.blitcoder', 'plugins');
      }
      const configPath = path.join(targetDir, k, 'config.json');
      if (fs.existsSync(configPath)) {
        const raw = fs.readJsonSync(configPath);
        const configIdx = Array.isArray(raw) ? raw.findIndex((v: any) => v === '!@plugin.data.json') : -1;
        const config = configIdx !== -1 ? raw[configIdx + 1] : null;
        if (config) {
          desc = config.description || desc;
          version = config.version || version;
        }
      }
    } catch (e) {}
    
    return {
      label: k,
      value: k,
      size: 'Unknown',
      description: `${desc}\nVersion: ${version}`,
      isCustom: true
    };
  });
};

const MultiSelectPlugin = ({ onConfirm, onBack }: { onConfirm: (toInstall: string[], toUninstall: string[]) => void, onBack: () => void }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const installedKeys = React.useMemo(() => getInstalledPluginKeys(), []);
  
  // Custom plugins that are currently on disk
  const customPlugins = React.useMemo(() => getCustomPlugins(), [installedKeys]);

  // Initial state: any plugin on disk is "checked"
  const [checkedItems, setCheckedItems] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    FEATURED_PLUGINS.forEach(p => {
      if (installedKeys.includes(p.value)) initial.add(p.value);
    });
    customPlugins.forEach(p => {
      initial.add(p.value);
    });
    return initial;
  });

  // Construct items list with categories
  const items = React.useMemo(() => {
    const list: any[] = [];
    
    // Featured
    FEATURED_PLUGINS.forEach(p => list.push({ ...p, isCustom: false, type: 'plugin' }));
    
    // Divider
    list.push({ type: 'divider', label: '--- CUSTOM MENU ---', value: 'divider_custom' });

    // Custom
    if (customPlugins.length > 0) {
      customPlugins.forEach(p => list.push({ ...p, type: 'plugin' }));
    } else {
      list.push({ type: 'empty_custom', label: '(No custom plugins installed)', value: 'empty_custom_placeholder', description: 'Create or import a custom plugin first.' });
    }

    // Back
    list.push({ type: 'action', label: 'Back', value: 'back', description: 'Return to previous menu.' });
    return list;
  }, [customPlugins]);

  // Handle arrows and spacing
  useInput((input, key) => {
    if (key.upArrow) {
      let nextIndex = selectedIndex - 1;
      // Skip divider
      if (nextIndex >= 0 && items[nextIndex].type === 'divider') {
        nextIndex--;
      }
      if (nextIndex >= 0) setSelectedIndex(nextIndex);
    } else if (key.downArrow) {
      let nextIndex = selectedIndex + 1;
      // Skip divider
      if (nextIndex < items.length && items[nextIndex].type === 'divider') {
        nextIndex++;
      }
      if (nextIndex < items.length) setSelectedIndex(nextIndex);
    } else if (input === ' ') {
      const current = items[selectedIndex];
      if (current.type === 'plugin') {
        const newChecked = new Set(checkedItems);
        if (newChecked.has(current.value)) {
          newChecked.delete(current.value);
        } else {
          newChecked.add(current.value);
        }
        setCheckedItems(newChecked);
      }
    } else if (key.return) {
      const current = items[selectedIndex];
      if (current.value === 'back') {
        onBack();
      } else {
        // Calculate diff: which featured plugins need installing, which need uninstalling
        const toInstall: string[] = [];
        const toUninstall: string[] = [];

        // Check Featured
        FEATURED_PLUGINS.forEach(p => {
          const isChecked = checkedItems.has(p.value);
          const isInstalled = installedKeys.includes(p.value);
          if (isChecked && !isInstalled) toInstall.push(p.value);
          if (!isChecked && isInstalled) toUninstall.push(p.value);
        });

        // Check Custom (unchecking a custom plugin uninstall/removes it)
        customPlugins.forEach(p => {
          if (!checkedItems.has(p.value)) {
            toUninstall.push(p.value);
          }
        });

        onConfirm(toInstall, toUninstall);
      }
    }
  });

  // Calculate sliding window scrolling (max 6 visible lines)
  const maxVisibleCount = 6;
  const scrollIndex = Math.max(0, Math.min(items.length - maxVisibleCount, selectedIndex - Math.floor(maxVisibleCount / 2)));
  const visibleItems = items.slice(scrollIndex, scrollIndex + maxVisibleCount);

  // Pad to always fill exactly maxVisibleCount rows so the layout never shifts
  const paddedItems = [...visibleItems];
  while (paddedItems.length < maxVisibleCount) {
    paddedItems.push({ type: 'padding', label: '', value: `__pad_${paddedItems.length}`, description: '' });
  }

  const highlightedItem = items[selectedIndex] || { description: '' };
  // Truncate description to 2 lines max to keep the details panel a fixed height
  const descLines = (highlightedItem.description || '(No description available)').split('\n').slice(0, 2);
  const descText = descLines.join(' — ');

  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Text bold color="yellow">Available Plugins (Space to select, Enter to confirm)</Text>

      {/* Fixed-height list — always exactly maxVisibleCount rows */}
      <Box flexDirection="column" marginTop={1}>
        {paddedItems.map((item, i) => {
          if (item.type === 'padding') {
            return <Text key={item.value}> </Text>;
          }

          const indexInFullList = items.findIndex(it => it.value === item.value);
          const isFocused = indexInFullList === selectedIndex;
          const isChecked = checkedItems.has(item.value);

          if (item.type === 'divider') {
            return <Text key={item.value} color="blue" bold>{item.label}</Text>;
          }

          if (item.type === 'action') {
            return (
              <Text key={item.value}>
                {isFocused ? <Text color="cyan">❯ </Text> : '  '}{item.label}
              </Text>
            );
          }

          if (item.type === 'empty_custom') {
            return (
              <Text key={item.value} color="gray">
                {isFocused ? <Text color="cyan">❯ </Text> : '  '}{item.label}
              </Text>
            );
          }

          return (
            <Text key={item.value}>
              {isFocused ? <Text color="cyan">❯ </Text> : '  '}
              {isChecked ? <Text color="green">[x] </Text> : '[ ] '}
              {item.label}{item.size && item.size !== 'Unknown' ? <Text color="gray"> ({item.size})</Text> : null}
            </Text>
          );
        })}
      </Box>

      {/* Fixed-height details panel — no key prop, so it never remounts */}
      <Box flexDirection="column" marginTop={1}>
        <Text bold color="blue">Plugin Details:</Text>
        <Text wrap="truncate-end">{descText}</Text>
      </Box>
    </Box>
  );
};

const SettingsMenu = ({ onExit, terminalSize, injectedComponents = {}, onFeaturedPlugins }: { onExit: () => void, terminalSize: any, injectedComponents?: Record<string, React.ComponentType<any>>, onFeaturedPlugins?: () => void }) => {
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [status, setStatus] = useState('');
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [installingPlugins, setInstallingPlugins] = useState<{ install: string[], uninstall: string[] } | null>(null);
  const [menuCursor, setMenuCursor] = useState(0);

  const items = React.useMemo(() => [
    { label: 'System Prompt', value: 'System Prompt' },
    { label: 'Default AI Model', value: 'Default AI Model' },
    { label: 'Dynamic Truncation', value: 'Dynamic Truncation' },
    { label: 'Ollama Install', value: 'Ollama' },
    { label: 'Plugins', value: 'blitcoder.addons' },
    ...Object.keys(injectedComponents).map(key => {
      const displayName = (key.includes(':') ? key.split(':').slice(1).join(':') : key)
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .trim();
      return { label: displayName, value: `plugin-injected:${key}` };
    }),
    { label: 'Exit', value: 'exit' },
  ], [injectedComponents]);

  const handleSelect = (item: any) => {
    if (item.value === 'exit') {
      onExit();
    } else if (item.value === 'Ollama') {
      setEditing('Ollama');
    } else if (item.value === 'Dynamic Truncation') {
      setEditing('Dynamic Truncation');
    } else if (item.value === 'blitcoder.addons') {
      setEditing('blitcoder.addons');
    } else if (item.value.startsWith('plugin-injected:')) {
      setEditing(item.value);
    } else {
      setEditing(item.value);
      try {
        if (fs.existsSync(SETTINGS_PATH)) {
          const settings = fs.readJsonSync(SETTINGS_PATH);
          setEditValue(settings[item.value] || '');
        }
      } catch (e) { }
    }
  };

  useInput((inputStr, key) => {
    if (editing === null) {
      if (key.upArrow) {
        setMenuCursor(c => (c - 1 + items.length) % items.length);
      } else if (key.downArrow) {
        setMenuCursor(c => (c + 1) % items.length);
      } else if (key.return) {
        handleSelect(items[menuCursor]);
      }
    }
  });

  const handleOllamaSelect = async (item: any) => {
    try {
      setStatus(`Switching to ${item.value} Ollama...`);

      // 1. Save setting
      let settings: any = {};
      if (fs.existsSync(SETTINGS_PATH)) {
        try { settings = fs.readJsonSync(SETTINGS_PATH); } catch (e) { settings = {}; }
      }
      settings["Ollama"] = item.value;
      fs.outputJsonSync(SETTINGS_PATH, settings, { spaces: 2 });

      // 2. Kill current Ollama
      await killOllama();

      // 3. Download binary if needed (ensureOllama handles it)
      if (item.value === 'minimal') {
        setStatus('Checking Minimal Ollama binary...');
      }

      // 4. Start new Ollama (auto-downloads if minimal mode and no binary)
      setStatus('Starting Ollama...');
      const started = await ensureOllama(item.value, (p) => {
        setStatus(`Downloading Minimal Ollama... ${p}%`);
        setDownloadProgress(p);
      });

      if (started) {
        setStatus(`Successfully switched to ${item.value} Ollama!`);
      } else {
        setStatus(`Switched setting to ${item.value}, but failed to start process.`);
      }

      setEditing(null);
    } catch (e: any) {
      setStatus(`Error: ${(e as any)?.message || e}`);
      setDownloadProgress(null);
      setEditing(null);
    }
  };

  const handleTruncationSelect = async (item: any) => {
    try {
      let settings: any = {};
      if (fs.existsSync(SETTINGS_PATH)) {
        try {
          settings = fs.readJsonSync(SETTINGS_PATH);
        } catch (e) {
          settings = {};
        }
      }
      settings["Dynamic Truncation"] = item.value;
      fs.outputJsonSync(SETTINGS_PATH, settings, { spaces: 2 });
      setStatus(`Truncation set to ${item.value}!`);
      setEditing(null);
    } catch (e: any) {
      setStatus(`Error saving: ${(e as any)?.message || e}`);
      setEditing(null);
    }
  };

  const handleEditSubmit = async (val: string) => {
    try {
      let settings: any = {};
      if (fs.existsSync(SETTINGS_PATH)) {
        try {
          settings = fs.readJsonSync(SETTINGS_PATH);
        } catch (e) {
          settings = {};
        }
      }
      settings[editing!] = val;
      fs.outputJsonSync(SETTINGS_PATH, settings, { spaces: 2 });
      setStatus(`Saved ${editing}!`);
      setEditing(null);
    } catch (e: any) {
      setStatus(`Error saving: ${(e as any)?.message || e}`);
      setEditing(null);
    }
  };


  return (
    <Box
      flexDirection="column"
      height={terminalSize.rows - 1}
      width={terminalSize.columns}
      padding={1}
    >
      {/* Header Panel (Fixed layout boundary) */}
      <Box flexDirection="column" flexShrink={0}>
        <Text bold color="cyan">⚙️  Settings Menu</Text>
        <Text color="gray" dimColor>(Edit at {SETTINGS_PATH})</Text>
      </Box>

      {/* Main Content Router Box (Stays exactly 14 rows high across all screens) */}
      <Box marginTop={1} flexDirection="column" height={14} flexShrink={0}>
        {editing === 'Ollama' ? (
          <Box flexDirection="column">
            <Text color="yellow">Select Ollama Install:</Text>
            <Text color="red">Note: If you want to repair your Minimal Ollama exe, Delete the ollama.exe file and redownload.
              If you select 'Existing install' you will need to install Ollama on your system first.
            </Text>
            <SelectInput
              items={[
                { label: 'Use Existing Install (system ollama)', value: 'existing' },
                { label: 'Minimal Install (local .blitcoder/bin)', value: 'minimal' },
                { label: 'Back', value: 'back' }
              ]}
              onSelect={(item) => item.value === 'back' ? setEditing(null) : handleOllamaSelect(item)}
            />
            {downloadProgress !== null && (
              <Box marginTop={1} flexDirection="column">
                <Text color="cyan">Downloading: [{Array(Math.floor(downloadProgress / 5)).fill('█').join('').padEnd(20, ' ')}] {downloadProgress}%</Text>
              </Box>
            )}
          </Box>
        ) : editing === 'Dynamic Truncation' ? (
          <Box flexDirection="column">
            <Text color="yellow">Select Dynamic Truncation Mode:</Text>
            <SelectInput
              items={[
                { label: 'OFF (Show everything)', value: 'OFF' },
                { label: 'ON (Truncate with hint)', value: 'ON' },
                { label: 'ON+ (Silent Truncation)', value: 'ON+' },
                { label: 'Back', value: 'back' }
              ]}
              onSelect={(item) => item.value === 'back' ? setEditing(null) : handleTruncationSelect(item)}
            />
          </Box>
        ) : editing === 'blitcoder.addons' ? (
          <Box flexDirection="column">
            <Text color="yellow">Plugin Manager:</Text>
            <SelectInput
              items={[
                { label: 'Install/Uninstall Plugins', value: 'blitcoder.addons.install' },
                { label: 'Featured Plugins', value: 'blitcoder.addons.featured' },
                { label: 'Plugin Settings', value: 'blitcoder.addons.settings' },
                { label: 'Back', value: 'back' }
              ]}
              onSelect={(item) => {
                if (item.value === 'blitcoder.addons.featured') {
                  onFeaturedPlugins?.();
                } else if (item.value === 'back') {
                  setEditing(null);
                } else {
                  setEditing(item.value);
                }
              }}
            />
          </Box>
        ) : editing === 'blitcoder.addons.install' ? (
          <Box flexDirection="column">
            {installingPlugins ? (
              <Box flexDirection="column">
                <Text color="yellow">Confirm Installation & Changes:</Text>
                {installingPlugins.install.length > 0 && (
                  <Text color="green">To Install: {installingPlugins.install.join(', ')}</Text>
                )}
                {installingPlugins.uninstall.length > 0 && (
                  <Text color="red">To Uninstall: {installingPlugins.uninstall.join(', ')}</Text>
                )}
                <Box marginTop={1}>
                  <SelectInput 
                    items={[{label: 'Yes (Y)', value: 'y'}, {label: 'No (N)', value: 'n'}]}
                    onSelect={(item) => {
                      if (item.value === 'y') {
                         try {
                           const settings = fs.existsSync(SETTINGS_PATH) ? fs.readJsonSync(SETTINGS_PATH) : {};
                           let targetDir = path.join(process.cwd(), '.blitcoder', 'plugins');
                           if (settings["Plugin Install Location"] === "User folder") {
                             targetDir = path.join(os.homedir(), '.blitcoder', 'plugins');
                           }
                           fs.ensureDirSync(targetDir);
                           installingPlugins.install.forEach((k: string) => {
                             const src = path.join(process.cwd(), 'Plugins.examples', k);
                             const dest = path.join(targetDir, k);
                             if (fs.existsSync(src)) fs.copySync(src, dest);
                           });
                           installingPlugins.uninstall.forEach((k: string) => {
                             const dest = path.join(targetDir, k);
                             if (fs.existsSync(dest)) fs.removeSync(dest);
                           });
                           setStatus(`Plugin settings sync completed successfully.`);
                         } catch(err: any) {
                            setStatus(`Sync failed: ${(err as any)?.message || err}`);
                         }
                         setInstallingPlugins(null);
                         setEditing('blitcoder.addons');
                      } else {
                         setInstallingPlugins(null);
                      }
                    }}
                  />
                </Box>
              </Box>
            ) : (
              <MultiSelectPlugin 
                onConfirm={(toInstall, toUninstall) => {
                  let settings: any = {};
                  try { if (fs.existsSync(SETTINGS_PATH)) settings = fs.readJsonSync(SETTINGS_PATH); } catch(e){}
                  if (!settings["Plugin Install Location"]) {
                     settings["Plugin Install Location"] = "BlitCoder Install";
                     fs.outputJsonSync(SETTINGS_PATH, settings, { spaces: 2 });
                  }
                  if (toInstall.length === 0 && toUninstall.length === 0) {
                    setEditing('blitcoder.addons');
                    return;
                  }
                  setInstallingPlugins({ install: toInstall, uninstall: toUninstall });
                }} 
                onBack={() => setEditing('blitcoder.addons')} 
              />
            )}
          </Box>
        ) : editing === 'blitcoder.addons.settings' ? (
          <Box flexDirection="column" height={14}>
            <Text color="yellow">Plugin Settings:</Text>
            <SelectInput
              items={[
                { label: 'Plugin Success Text', value: 'blitcoder.addons.settings.success' },
                { label: 'Plugin Install Location', value: 'blitcoder.addons.settings.location' },
                { label: 'Back', value: 'back' }
              ]}
              onSelect={(item) => {
                if (item.value === 'back') {
                  setEditing('blitcoder.addons');
                } else {
                  setEditing(item.value);
                }
              }}
            />
          </Box>
        ) : editing === 'blitcoder.addons.settings.success' ? (
          <Box flexDirection="column" height={14}>
            <Text color="yellow">Plugin Success Text:</Text>
            <SelectInput
              items={[
                { label: 'ON', value: 'ON' },
                { label: 'OFF', value: 'OFF' },
                { label: 'Back', value: 'back' }
              ]}
              onSelect={(item) => {
                if (item.value === 'back') {
                  setEditing('blitcoder.addons.settings');
                } else {
                  let settings: any = {};
                  try { if (fs.existsSync(SETTINGS_PATH)) settings = fs.readJsonSync(SETTINGS_PATH); } catch(e){}
                  settings["Plugin Success Text"] = item.value;
                  fs.outputJsonSync(SETTINGS_PATH, settings, { spaces: 2 });
                  setStatus(`Plugin Success Text set to ${item.value}`);
                  setEditing('blitcoder.addons.settings');
                }
              }}
            />
          </Box>
        ) : editing === 'blitcoder.addons.settings.location' ? (
          <Box flexDirection="column" height={14}>
            <Text color="yellow">Plugin Install Location:</Text>
            <SelectInput
              items={[
                { label: 'BlitCoder Install', value: 'BlitCoder Install' },
                { label: 'User folder', value: 'User folder' },
                { label: 'Back', value: 'back' }
              ]}
              onSelect={(item) => {
                if (item.value === 'back') {
                  setEditing('blitcoder.addons.settings');
                } else {
                  let settings: any = {};
                  try { if (fs.existsSync(SETTINGS_PATH)) settings = fs.readJsonSync(SETTINGS_PATH); } catch(e){}
                  settings["Plugin Install Location"] = item.value;
                  fs.outputJsonSync(SETTINGS_PATH, settings, { spaces: 2 });
                  setStatus(`Plugin Install Location set to ${item.value}`);
                  setEditing('blitcoder.addons.settings');
                }
              }}
            />
          </Box>
        ) : editing && editing.startsWith('plugin-injected:') ? (
          <Box height={14}>
            {(() => {
              const compKey = editing.slice('plugin-injected:'.length);
              const InjectedComponent = compKey ? injectedComponents[compKey] : undefined;
              return InjectedComponent ? <InjectedComponent onExit={() => setEditing(null)} /> : null;
            })()}
          </Box>
        ) : editing ? (
          <Box flexDirection="column" height={14}>
            <Text color="yellow">Editing: {editing}</Text>
            <Box flexDirection="row" marginTop={1}>
              <Text color="cyan">❯ </Text>
              <TextInput value={editValue} onChange={setEditValue} onSubmit={handleEditSubmit} />
            </Box>
            <Text color="gray" dimColor>(Press Enter to save)</Text>
          </Box>
        ) : (
          <Box height={14} flexDirection="column">
            {items.map((item, i) => (
              <Text key={item.value} color={i === menuCursor ? 'cyan' : undefined}>
                {item.label}
              </Text>
            ))}
          </Box>
        )}
      </Box>

      {/* Spacer Box: Flexes dynamically to push everything down and pin down the layout boundaries */}
      <Box flexGrow={1} />

      {/* Bottom Status Area (Anchored to the absolute bottom row) */}
      <Box height={1} flexShrink={0}>
        <Text color="green">{status || ' '}</Text>
      </Box>
    </Box>
  );
};



export async function startTUI(initialWorkspace?: string | null,   initialPluginMode?: 'create' | 'import' | 'featured' | null, mode?: 'chat' | 'setup') {
  const { waitUntilExit } = render(<App initialWorkspace={initialWorkspace} initialPluginMode={initialPluginMode} mode={mode} />);
  await waitUntilExit();
}
