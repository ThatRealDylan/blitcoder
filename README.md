# BlitCoder

> NOTICE: BlitCoder is being rewritten. Check [rewritten repo](https://github.com/ThatRealDylan/blitcoder-rewrite). BR will be archived/sunsetting as soon as BRW is in late development/mostly done.

> dylan note: ts kinda rushed so lots of fixes later

**BlitCoder** is a high-performance, developer-first AI coding assistant that brings the power of autonomous coding to both your terminal and your desktop. Built with **TypeScript** and **Bun**, it seamlessly bridges the gap between high-speed TUI efficiency and a premium GUI experience.

---

## ⚡ Dual-Mode Power

| Mode | Command | Description |
|------|---------|-------------|
| TUI | `bun run index.ts` | Low-latency Ink-powered terminal interface |
| GUI | `bun run index.ts --gui` | Premium React + Electron desktop app |
| ASCII | `bun run index.ts --ascii` | Print logo to stdout and exit |

---

## ✨ Key Features

- **Autonomous Capabilities** — Read, write, and delete files with permission-gated safety for dangerous actions
- **Persistent Sessions** — Session Manager (`/sessions`) to browse, preview, and restore conversations
- **Ollama Orchestration** — Switch between system Ollama and minimal local install with auto-binary download
- **Dynamic Truncation** — Smart tool output handling (OFF / ON / ON+ modes)
- **Interactive File Viewer** — View large files directly in the TUI
- **Cloud & Local Hybrid** — DeepSeek, GPT-OSS, Ollama, and local GGUF model support
- **Plugin System** — Extensible SDK with scripts, React mods, lifecyle hooks, and custom chat commands

---

## 🚀 Quick Start

```bash
# Clone & install
git clone https://github.com/ThatRealDylan/blitcoder.git
cd blitCoder
bun install

# Start TUI
bun run index.ts
```

---

## 📖 Documentation

| Resource | Description |
|----------|-------------|
| [`MEGADOC.md`](https://github.com/ThatRealDylan/blitcoder/blob/main/docs/MEGADOC.md) | Complete documentation covering architecture, usage, SDK, API, and deployment |
| [`docs/plugins.md`](https://github.com/ThatRealDylan/blitcoder/blob/main/docs/plugins.md) | Plugin SDK reference (hooks, commands, config) |
| [`docs/code.md`](https://github.com/ThatRealDylan/blitcoder/blob/main/docs/code.md) | Codebase architecture overview |
| [`docs/how-to-use.md`](https://github.com/ThatRealDylan/blitcoder/blob/main/docs/MEGADOC.md) | Quick usage guide and command reference |

---

## 🔌 Plugin System

BlitCoder features a modular plugin architecture:

- **Scripts** — `runScript(pluginPath, sdk)` executed at startup with full filesystem access
- **Mods** — React/Ink UI components injected into Settings menu (e.g., File Explorer, API config panels)
- **Hooks** — Lifecycle event listeners: `onInit`, `onMessage`, `onToolCall`, `onExit`
- **Commands** — Register custom `/command` handlers via `sdk.registerCommand()`

Three featured plugins ship with BlitCoder:
- `blitgui` — Launch BlitCoder as a desktop GUI from within the TUI
- `extra-apis` — Configure custom API endpoints for cloud models
- `integrated-fs` — Workspace file explorer and management

---

## ⌨️ Command Palette

| Command | Action |
|---------|--------|
| `/help` | Print all commands |
| `/clear` | Fresh conversation |
| `/sessions` | Browse chat history |
| `/upload <path>` | Attach a file |
| `/model <name>` | Set AI model |
| `/model list` | List available models |
| `/plugin create` | Create a new plugin |
| `/plugin list` | List installed plugins |

---

## 🛠️ Configuration

| Path | Purpose |
|------|---------|
| `~/.blitcoder/settings.json` | AI provider, Ollama mode, UI preferences |
| `~/.blitcoder/chats/` | Session history |
| `.blitcoder/plugins/` | Project-local plugins |

---

Built with ❤️ by the BlitAI Team.
