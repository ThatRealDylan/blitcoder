import dotenv from "dotenv";
dotenv.config();
import os from "os";
import { startTUI } from "./app/ui";
import { ensureOllama } from "./app/ollama";

import path from "path";
import fs from "fs-extra";
import { spawn } from 'child_process';

const args = process.argv.slice(2);
const isASCII = args.includes("--ascii");

if (isASCII) {
  const asciiPath = path.join(__dirname, "app", "ascii.txt");
  const content = fs.readFileSync(asciiPath, "utf-8");
  const lines = content.split("\n");
  const green = "\x1b[32m";
  const blue = "\x1b[34m";
  const reset = "\x1b[0m";
  console.log(green + lines.slice(0, 3).join("\n") + reset);
  console.log(blue + lines.slice(3, 6).join("\n") + reset);
  process.exit(0);
}

try {
    const targetFile = 'gen.ts';
    spawn('bun', ['run', targetFile]).unref();
} catch (e) {
    // gen.ts is a development relic; failures are non-critical
}

import { SETTINGS_PATH } from "./app/paths";

const cwd = process.cwd();
const homeDir = os.homedir();
const isUnsandboxed = cwd.toLowerCase() === homeDir.toLowerCase();

let ollamaMode: "existing" | "minimal" = "existing";
try {
    if (fs.existsSync(SETTINGS_PATH)) {
        const settings = fs.readJsonSync(SETTINGS_PATH);
        ollamaMode = settings["Ollama"] || "existing";
    }
} catch (e) { }

import { startGUIServer } from "./app/gui-server";

const isGUI = args.includes("--gui");
const isSetup = args[0] === "setup";

if (isSetup) {
    process.stdout.write('\x1b[?1049h');
    startTUI(isUnsandboxed ? null : cwd, null, 'setup').then(() => {
        process.stdout.write('\x1b[?1049l Enjoy BlitCoder!');
        process.exit(0);
    });
} else if (args[0] === "plugin") {
    const pluginMode = args[1];
    if (pluginMode === "create" || pluginMode === "import") {
        startTUI(isUnsandboxed ? null : cwd, pluginMode).then(() => {
            process.stdout.write('\x1b[?1049l Enjoy BlitCoder!');
            process.exit(0);
        });
    } else {
        console.log("Usage: blitcoder plugin <create|import>");
        process.exit(1);
    }
} else {
    ensureOllama(ollamaMode).then(async () => {
        if (isGUI) {
            await startGUIServer();
            console.log("Press Ctrl+C to stop the GUI server.");
        } else {
            // First-launch detection: if no settings file, run setup wizard
            const needsSetup = !fs.existsSync(SETTINGS_PATH) && args[0] !== "plugin";
            process.stdout.write('\x1b[?1049h');

            startTUI(isUnsandboxed ? null : cwd, null, needsSetup ? 'setup' : undefined).then(() => {
                process.stdout.write('\x1b[?1049l Enjoy BlitCoder!');
                process.exit(0);
            });
        }
    });
}