# How to Use BlitCoder

BlitCoder is a dual-mode developer assistant that can be operated in the terminal (TUI) or as a desktop hybrid (GUI).

## Running BlitCoder

Start the Terminal UI (TUI):
```bash
bun run index.ts
```

Start the Desktop GUI version:
```bash
bun run index.ts --gui
```

Print the ASCII logo to stdout and exit:
```bash
bun run index.ts --ascii
```

Launch the interactive setup wizard:
```bash
bun run index.ts setup
```

On first launch (no existing settings), the setup wizard runs automatically.

## Setup Wizard

The setup wizard is a 6-step interactive installer that guides you through configuring BlitCoder:

1. **Welcome** - ASCII logo + "Setup Now" (full configuration) or "Setup Later" (defaults + installation)
2. **Ollama** - System Ollama or Minimal bundled binary
3. **Workspaces** - Unsandboxed (full machine access) or Sandboxed (current workspace only)
4. **AI Provider** - OpenAI, Gemini, DeepSeek, Qwen, Ollama, or Skip (API key entry for each)
5. **Extra Settings** - Default AI model, truncation level, system prompt editing (via nano)
6. **Installation** - Release version picker, install location, download with progress bar

## Chat Commands

Typing a command starting with `/` inside the chat runs client commands:

- `/help`: Print all available commands.
- `/clear`: Clear the message history.
- `/exit`: Safe exit, triggers plugin shutdown hooks.
- `/model <model_name>`: Set the active AI model.
- `/model list`: List available cloud & local models.
- `/whichmodel`: Print the current model.
- `/upload <path>`: Upload a workspace file into the AI context.
- `/dir <path>`: Restrict AI modifications to the sandboxed path.
- `/localmodel <new|edit|delete> <name> <path>`: Manage custom local GGUF models.
- `/sessions`: Switch between past chat history sessions.
- `/view`: Expand the details of the most recent truncated tool output.
- `/plugin create`: Open the plugin creation wizard.
- `/plugin import`: Open the plugin import wizard.
- `/plugin list`: List all installed plugins with their status.
- `/plugin run [name]`: Run scripts for all plugins or a specific plugin by name.
- `/settings`: Open the settings panel.

## Keyboard Shortcuts (TUI)

- **`Ctrl+C`**: Close/exit the application.
- **`Ctrl+L`**: Clear message history logs.
- **`Shift+Tab`**: Access the Global settings menu.
- **`Esc`**: Exit custom submenu items or dialog panels.

## Plugin System

BlitCoder supports plugins with hooks and custom commands:

- **Hooks**: `onInit`, `onMessage`, `onToolCall`, `onExit` - lifecycle callbacks
- **Commands**: Register custom `/command` handlers via `sdk.registerCommand()`
- **Mods**: React components that inject into the TUI settings menu
- **Scripts**: Run on startup; can export both a `runScript` function and hook functions

See `docs/plugins.md` for the full Plugin SDK reference.
