# BlitCoder MEGADOC

> Version 1.0.0 — Everything you need to use, extend, and deploy BlitCoder.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Setup & Installation](#2-setup--installation)
3. [TUI Usage Guide](#3-tui-usage-guide)
4. [GUI Mode](#4-gui-mode)
5. [Plugin SDK Reference](#5-plugin-sdk-reference)
6. [Plugin Development Guide](#6-plugin-development-guide)
7. [API Reference](#7-api-reference)
8. [Configuration](#8-configuration)
9. [Deployment & Release](#9-deployment--release)

---

## 1. Architecture Overview

### Directory Layout

```
blitCoder/
├── index.ts                  # Entry point: --gui, --ascii, plugin mode, TUI launch
├── app/                      # Core application logic
│   ├── ai.ts                 # OpenAI-compatible AIClient (DeepSeek, Ollama, GPT-OSS)
│   ├── api.ts                # GUI chat API handler (with tool execution loop)
│   ├── autoupdate.ts         # GitHub release version checker
│   ├── gui-server.ts         # Bun HTTP server serving GUI dist/ + API routes
│   ├── history.ts            # Chat session persistence (UUID-based JSON files)
│   ├── ollama.ts             # Ollama process management, minimal binary download
│   ├── paths.ts              # Global/local config path constants
│   ├── plugin-hooks.ts       # Plugin SDK: commands, hooks, and lifecycle API
│   ├── plugin-runner.ts      # Plugin discovery, loading, script/mod execution
│   ├── plugin-ui.tsx         # Plugin create/import wizard UIs
│   └── ui.tsx                # Main TUI app (Ink/React): chat, settings, file viewer
├── features/
│   └── tools.ts              # Tool definitions & handler (read/write/delete/list/run)
├── Plugins.examples/         # Featured plugin source templates
├── gui/                      # Separate React + Vite + Electron GUI app
├── scripts/                  # Installer scripts (install.bat, install.ps1)
├── docs/                     # Supplementary documentation
└── MEGADOC.md                # This file
```

### Module Dependencies

| Module | Imports | Purpose |
|--------|---------|---------|
| `index.ts` | All app/* | Entry point, CLI arg parsing, Ollama bootstrap |
| `ui.tsx` | ai, history, ollama, paths, plugin-runner, plugin-hooks | Main TUI loop, settings, sessions |
| `plugin-runner.ts` | plugin-hooks | Discovers plugins, runs scripts, detects hooks |
| `plugin-hooks.ts` | (standalone) | PluginSDK class, PluginHookManager singleton |
| `api.ts` | ai, tools, paths, history | GUI HTTP API with tool execution loop |
| `gui-server.ts` | api, paths | Bun HTTP server for Electron GUI |

### Data Flow

```
User Input → ui.tsx (handleSubmit)
  → AI chat() call → tool_calls detected?
    → Yes → execute tools → feed result back to AI → loop
    → No → display response
  → Plugin hooks triggered at each stage
    → onMessage → onToolCall → onExit
```

---

## 2. Setup & Installation

### Prerequisites

- **Bun** (v1.2+)
- **Node.js** 18+ (for Electron GUI)
- **Git** (for cloning)

### Quick Install

```bash
# Clone
git clone https://github.com/ThatRealDylan/blited.git
cd blitCoder

# Install dependencies
bun install

# Start TUI
bun run index.ts
```

### Automated Install

**Windows (PowerShell):**
```powershell
irm https://<hosted-url>/install.ps1 | iex
```

**Windows (CMD):**
```cmd
scripts\install.bat
```

### Display ASCII Logo

```bash
bun run index.ts --ascii
```
Prints the BlitCoder logo in green/blue to stdout and exits.

---

## 3. TUI Usage Guide

### Starting the TUI

```bash
bun run index.ts
```

### Chat Commands

| Command | Description |
|---------|-------------|
| `/help` | Print all available commands |
| `/clear` | Clear message history |
| `/exit` | Exit BlitCoder safely (triggers plugin shutdown hooks) |
| `/model <name>` | Set the active AI model |
| `/model list` | List available cloud & local models |
| `/whichmodel` | Show current model |
| `/upload <path>` | Upload a file into AI context |
| `/dir <path>` | Set workspace directory |
| `/localmodel <new\|edit\|delete> <name> <path>` | Manage local GGUF models |
| `/sessions` | Browse and restore past chat sessions |
| `/view` | Expand the last truncated tool output |
| `/plugin create` | Interactive plugin creation wizard |
| `/plugin import` | Import an existing plugin |
| `/plugin list` | List all installed plugins |
| `/plugin run <name>` | Run all scripts for a named plugin |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+C` | Exit application |
| `Shift+Tab` | Open Settings menu |
| `Ctrl+L` | Clear message history |
| `Esc` | Exit submenus / dialogs |
| `Up/Down Arrow` | Scroll message history |

### Settings Menu

Access with `Shift+Tab`:

- **System Prompt**: Edit the base system prompt
- **Default AI Model**: Set the active model
- **Dynamic Truncation**: Control tool output display (OFF / ON / ON+)
- **Ollama Install**: Switch between system Ollama and minimal local install
- **Plugins**: Install/uninstall plugins, configure plugin settings

---

## 4. GUI Mode

### Starting the GUI

```bash
bun run index.ts --gui
```

### Prerequisites

```bash
cd gui && bun run build && cd ..
```

The GUI is a React + Vite application wrapped in Electron, served by a Bun HTTP server (`gui-server.ts`). It communicates with the backend through REST API endpoints:

- `POST /api/chat` — Send chat messages with tool execution loop
- `GET /api/sessions` — List chat sessions
- `GET /api/sessions/:id` — Load a specific session
- `GET /api/settings` — Get current settings
- `POST /api/settings` — Update settings

---

## 5. Plugin SDK Reference

### Overview

Plugins extend BlitCoder through three mechanisms:

1. **Scripts** (`scripts/`) — Background tasks run at startup, receive `pluginPath` and `sdk`
2. **Mods** (`mods/`) — React/Ink UI components injected into the Settings menu
3. **Hooks** — Lifecycle event listeners exported from script files

### Plugin Directory Structure

```
.blitcoder/plugins/<plugin-id>/
├── config.json       # Metadata & configuration
├── README.md         # Plugin description (shown in Plugin Manager)
├── mods/             # React/Ink UI components (.tsx, .jsx)
├── scripts/          # Execution scripts (.js, .mjs, .ts)
└── data/             # Persistent runtime storage
```

### config.json Format

```json
[
  "!@blitcoder.plugin",
  "!@plugin.data.json",
  {
    "name": "My Plugin",
    "id": "com.author.myplugin",
    "version": "1.0.0",
    "description": "What this plugin does",
    "author": "Author Name",
    "license": "MIT",
    "file-modifications-folder": "mods",
    "scripts-folder": "scripts",
    "data-folder": "data"
  },
  "!@metadata",
  {
    "binded": false,
    "git-repo": false,
    "gitRepo": "invalid"
  }
]
```

### PluginSDK API

Each script receives a `sdk` object as the second argument to `runScript(pluginPath, sdk)`.

#### `sdk.registerCommand(name, handler)`
Register a custom chat command.

- `name: string` — Command name (without `/`)
- `handler: (args: string, history: ChatMessage[]) => void` — Called when user types `/<name>`

#### `sdk.getDataPath(pluginName)`
Get the path to this plugin's `data/` folder.

#### `sdk.getConfig(pluginName)`
Get this plugin's parsed config object.

### Hook System

Export these functions from script files:

#### `onInit(sdk: PluginSDK)`
Called at startup after all plugins are loaded. Use for registering commands or initializing state.

#### `onMessage(message: ChatMessage, context: any)`
Called when the user submits a chat message.

#### `onToolCall(toolCall: any)`
Called when the AI requests a tool execution.

#### `onExit()`
Called when BlitCoder shuts down.

### Mod Components

Mod files export React/Ink components registered under their PascalCase name. Each receives `{ onExit: () => void }` as props and appears as a submenu in Settings.

### Script Run Behavior

- `runScript(pluginPath, sdk)` is called at startup
- Console output (`console.log`/`console.error`) is captured and reported
- A script that exports ONLY hooks (no `runScript`) is valid — it produces `"Hooks registered (no runScript)"`

---

## 6. Plugin Development Guide

### Creating a Plugin

**Via TUI wizard:**
```
/plugin create
```
Follow the interactive prompts.

**Manually:**
1. Create directory at `.blitcoder/plugins/my-plugin/`
2. Create `config.json` (see format above)
3. Add scripts to `scripts/` and mods to `mods/`
4. Test with `bun run index.ts`

### Example: Minimal Plugin with Command

```javascript
// .blitcoder/plugins/my-plugin/scripts/logger.js
export async function runScript(pluginPath, sdk) {
  console.log("Logger plugin started!");
}

export function onInit(sdk) {
  sdk.registerCommand("hello", (args, history) => {
    console.log(`Hello from plugin! Args: ${args}`);
  });
}
```

User types `/hello world` → plugin logs "Hello from plugin! Args: world".

### Example: Settings Mod Component

```tsx
// .blitcoder/plugins/my-plugin/mods/MyPanel.tsx
import React from 'react';
import { Box, Text } from 'ink';

export const MyPanel = ({ onExit }: { onExit: () => void }) => {
  return (
    <Box flexDirection="column">
      <Text color="green">My Plugin Panel</Text>
      <Text>Press Esc to go back.</Text>
    </Box>
  );
};
```

### Testing Plugins

```bash
# List installed plugins
bun run index.ts -- /plugin list

# Run a specific plugin's scripts
bun run index.ts -- /plugin run my-plugin
```

### Tips

- Use `data/` folder for persistent storage (JSON files, logs, etc.)
- Mod components appear in Settings → plugins section
- Commands registered via hooks are available immediately
- Wrap async hook handlers in try/catch to avoid crashes

---

## 7. API Reference

### Paths (`app/paths.ts`)

| Constant | Path | Purpose |
|----------|------|---------|
| `SETTINGS_PATH` | `~/.blitcoder/settings.json` | Global settings |
| `MEMORY_PATH` | `~/.blitcoder/memory.json` | Runtime memory store |
| `BIN_DIR` | `.blitcoder/bin/` | Local binary storage (Ollama) |
| `LOCAL_MODELS_PATH` | `.blitcoder/models/` | Local GGUF model storage |
| `GET_CHATS_DIR(w)` | `.blitcoder/chats/` | Session history |

### Settings Schema (`settings.json`)

```json
{
  "System Prompt": "You are Antigravity, a coding assistant.",
  "Keyboard Shortcuts": { "exit": "ctrl+c", "clear": "ctrl+l" },
  "Memory": {},
  "Default AI Model": "None",
  "Ollama": "existing",
  "Dynamic Truncation": "ON",
  "Plugin Install Location": "BlitCoder Install",
  "Plugin Success Text": "ON"
}
```

### AI Client (`app/ai.ts`)

```typescript
const client = new AIClient({ 
  model: "gpt-oss:20b-cloud",
  baseUrl?: "http://localhost:11434/v1"  // for Ollama
});
const response = await client.chat(messages, tools);
```

Supports: DeepSeek, GPT-OSS cloud models, any OpenAI-compatible endpoint (Ollama, local).

### Tool Handler (`features/tools.ts`)

Built-in tools: `read_file`, `write_file`, `delete_file`, `list_dir`, `run_command`, `grep_search`, `search_web`.

---

## 8. Configuration

### File Locations

| Scope | Path | Priority |
|-------|------|----------|
| Local project | `.blitcoder/` | Higher |
| User global | `~/.blitcoder/` | Lower |

### Plugin Installation Locations

Set via Settings → Plugins → Plugin Install Location:
- **BlitCoder Install** — `.blitcoder/plugins/` (project-local)
- **User folder** — `~/.blitcoder/plugins/` (user-global)

### Ollama Modes

- **Existing install** — Uses system-installed Ollama
- **Minimal Install** — Auto-downloads and manages a portable binary at `.blitcoder/bin/ollama.exe`

---

## 9. Deployment & Release

### Building the GUI

```bash
cd gui && bun run build && cd ..
```
Builds the Vite React app into `gui/dist/` for serving.

### Creating a Release

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Tag commit: `git tag v1.0.0`
4. Push: `git push --tags`
5. Create GitHub release with built artifacts

### Global CLI Installation

```bash
# If published to npm
npm install -g blitcoder
blitcoder      # starts TUI
blitcoder --gui
blitcoder --ascii
```

### Updating

BlitCoder checks for updates on startup via the GitHub releases API. If a newer version is found, it logs a notification.
