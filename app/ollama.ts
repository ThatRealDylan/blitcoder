import { spawn, execSync } from "child_process";
import fs from "fs-extra";
import path from "path";

import { BIN_DIR } from "./paths";

export type OllamaMode = "existing" | "minimal";

/** Normalize legacy/alternate settings values (e.g. "system") to supported modes. */
export function normalizeOllamaMode(mode: string | undefined | null): OllamaMode {
  if (mode === "minimal") return "minimal";
  return "existing";
}

function getLocalBinPath(): string {
  return process.platform === "win32"
    ? path.join(BIN_DIR, "ollama.exe")
    : path.join(BIN_DIR, "ollama");
}

function getPidFilePath(): string {
  return path.join(BIN_DIR, "ollama-minimal.pid");
}

export async function killOllama(mode?: OllamaMode) {
  const pidFile = getPidFilePath();
  if (mode === "minimal" || fs.existsSync(pidFile)) {
    try {
      const pid = parseInt(fs.readFileSync(pidFile, "utf-8").trim(), 10);
      if (pid > 0) {
        if (process.platform === "win32") {
          execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
        } else {
          execSync(`kill ${pid}`, { stdio: "ignore" });
        }
      }
    } catch (e) { /* pid file stale or process already gone */ }
    try { fs.removeSync(pidFile); } catch (e) { /* ignore */ }
    return;
  }

  // existing/system mode: only stop a locally spawned minimal instance if tracked
  if (fs.existsSync(pidFile)) {
    await killOllama("minimal");
  }
}

export async function ensureOllama(mode: OllamaMode | string = "existing", onProgress?: (pct: number) => void) {
  const normalizedMode = normalizeOllamaMode(mode);
  const isRunning = await checkOllama();
  if (isRunning) return true;

  const localBin = getLocalBinPath();

  if (normalizedMode === "minimal" && !fs.existsSync(localBin)) {
    if (process.platform === "win32") {
      await downloadOllama(onProgress || (() => {}));
    } else {
      throw new Error(
        "Minimal Ollama auto-download is only supported on Windows. Install Ollama system-wide or use 'existing' mode."
      );
    }
  }

  const binPath = normalizedMode === "minimal" && fs.existsSync(localBin) ? localBin : "ollama";

  try {
    const child = spawn(binPath, ["serve"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();

    if (normalizedMode === "minimal" && child.pid) {
      await fs.ensureDir(BIN_DIR);
      fs.writeFileSync(getPidFilePath(), String(child.pid));
    }
  } catch (e) {
    return false;
  }

  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (await checkOllama()) return true;
  }

  return false;
}

export async function downloadOllama(onProgress: (percent: number) => void) {
  if (process.platform !== "win32") {
    throw new Error("Minimal Ollama download is only available on Windows.");
  }

  await fs.ensureDir(BIN_DIR);
  const exePath = getLocalBinPath();
  const url = "https://github.com/stewdevv/miniollama/releases/latest/download/ollama.exe";

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download: ${response.statusText}`);

  const total = parseInt(response.headers.get("content-length") || "0", 10);
  let loaded = 0;

  const reader = response.body?.getReader();
  if (!reader) throw new Error("Could not get response body reader");

  const writer = fs.createWriteStream(exePath);

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    loaded += value.length;
    if (total) onProgress(Math.round((loaded / total) * 100));
    writer.write(value);
  }
  writer.end();

  await new Promise<void>((resolve) => writer.on("finish", resolve));
  return true;
}

async function checkOllama() {
  try {
    const res = await fetch("http://localhost:11434/api/tags");
    return res.ok;
  } catch (e) {
    return false;
  }
}
