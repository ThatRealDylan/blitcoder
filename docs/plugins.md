# BlitCoder Plugin SDK

BlitCoder features a modular architecture where plugins can extend functionality by:
- Injecting custom React components into the Settings menu (`mods/`).
- Running background startup tasks (`scripts/`).
- Listening to lifecycle events and chat actions (`hooks`).

## Directory Structure
An individual plugin resides in `.blitcoder/plugins/<id>/` or `~/.blitcoder/plugins/<id>/`:
```
<plugin-id>/
├── config.json       # Metadata & configurations
├── README.md         # Documentation snippet (shown in Plugin Manager)
├── mods/             # UI elements (React Components)
├── scripts/          # Node.js/Bun execution scripts
└── data/             # Persistent storage folder managed by the plugin
```

## config.json Format
The plugin config files use a serialized array structure to handle metadata safely:
```json
[
  "!@blitcoder.plugin",
  "!@plugin.data.json",
  {
    "name": "My Plugin",
    "id": "com.myname.myplugin",
    "version": "1.0.0",
    "description": "Short summary of what this plugin does.",
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

## Hook System
Plugins can hook into BlitCoder lifecycles by exporting specific functions from their scripts:

### `onInit(sdk: PluginSDK)`
Triggered on application startup. Used for registering custom commands or initializing plugin state.

### `onMessage(message: ChatMessage, context: any)`
Fires whenever the user submits a message in the chat.

### `onToolCall(toolCall: any)`
Fires whenever a tool is about to be executed by the AI.

### `onExit()`
Fires when the user exits BlitCoder.

## Example script (`scripts/logger.js`)
```javascript
export async function runScript(pluginPath, sdk) {
  console.log("Logger plugin started!");
}

export function onInit(sdk) {
  sdk.registerCommand("hello", (args, history) => {
    console.log("Hello from Plugin Command! Args: " + args);
  });
}
```
