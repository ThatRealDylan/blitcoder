# BlitCoder Architecture & Codebase

This document describes the structure and module dependencies of the BlitCoder codebase.

## Folder Directory
```
blitCoder/
├── app/                  # Main Application logic
│   ├── ai.ts             # OpenAI & Ollama client endpoints
│   ├── api.ts            # GUI API and tool integration
│   ├── gui-server.ts     # Bun HTTP server for Electron GUI
│   ├── history.ts        # Session history persistence
│   ├── ollama.ts         # Local Ollama daemon orchestrator
│   ├── paths.ts          # Central configuration path helper
│   ├── plugin-hooks.ts   # Plugin SDK commands and hooks API
│   ├── plugin-runner.ts  # Dynamic loader for plugins, mods, and scripts
│   ├── plugin-ui.tsx     # Custom TUI for creating and importing plugins
│   └── ui.tsx            # Core TUI loop implemented in Ink/React
├── features/             # Core capabilities (File manipulation tools)
│   └── tools.ts          # Tool Definitions (read_file, run_command, etc.)
├── gui/                  # Electron GUI Frontend (React/Vite app)
└── scripts/              # Remote-hosted installer scripts
```

## Core Modules

### 1. `app/ui.tsx`
The TUI entry point. Renders the interface in the alternate terminal screen buffer. It processes chat submissions, coordinates tool execute confirmations, routes commands, and handles settings layout wiggling preventions.

### 2. `app/plugin-runner.ts`
Loads plugins from both global (`~/.blitcoder/plugins`) and local (`.blitcoder/plugins`) directories. It dynamically imports mod React components and registers lifecycle hooks.

### 3. `app/plugin-hooks.ts`
Exposes the SDK class and hook triggers (`onMessage`, `onToolCall`, `onExit`) to let third-party scripts register commands and hook listeners.

### 4. `app/ollama.ts`
Auto-detects active local instances of Ollama. In `minimal` mode, it dynamically fetches the single portable binary from remote release mirrors and boots up the local server daemon.
