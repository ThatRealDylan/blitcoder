# Changelog

## v1.0.0 (2026-05-28)

Initial public release of BlitCoder.

### Features

- **Dual-Mode Interface**: Terminal UI (Ink/React) and Desktop GUI (React + Vite + Electron)
- **Autonomous AI Assistant**: Read, write, delete files with permission-gated safety
- **Ollama Orchestration**: System Ollama or auto-downloaded minimal local binary
- **Cloud & Local Models**: DeepSeek, GPT-OSS, Ollama, GGUF support
- **Session Manager**: Browse, preview, and restore past conversations
- **Dynamic Truncation**: Smart tool output handling (OFF / ON / ON+)
- **Plugin SDK**: Scripts, React mods, lifecycle hooks, and custom chat commands
- **Settings Menu**: System prompt, model selection, Ollama mode, truncation, plugin management
- **Persistent Configuration**: JSON-based settings, history, and memory storage

### Plugin SDK

- `runScript(pluginPath, sdk)` for startup automation
- React/Ink mod components for Settings UI injection
- Lifecycle hooks: `onInit`, `onMessage`, `onToolCall`, `onExit`
- Custom chat command registration via `sdk.registerCommand()`
- Plugin creation and import wizards

### CLI

- `bun run index.ts` — Start TUI
- `bun run index.ts --gui` — Start GUI desktop app
- `bun run index.ts --ascii` — Print colored logo to stdout
- `bun run index.ts plugin create|import` — Plugin management

### Bug Fixes

- Fixed settings menu layout jitter (viewport matching + flexShrink + spacer)
- Fixed GUI API tool execution loop (was one-shot, now loops until complete)
- Fixed plugin name formatting (camelCase → readable labels)
- Fixed file explorer Back navigation (switched from SelectInput to useInput)
- Fixed Ollama download progress display
- Fixed TypeScript compilation errors across all modules



nigtly builds on the nightly branch comin soon