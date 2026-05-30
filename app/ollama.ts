import { spawn } from "child_process";
import fs from "fs-extra";
import path from "path";
import { execSync } from "child_process";

import { BIN_DIR } from "./paths";

export async function killOllama() {
  try {
    if (process.platform === 'win32') {
      execSync('taskkill /IM ollama.exe /F', { stdio: 'ignore' });
    } else {
      execSync('pkill ollama', { stdio: 'ignore' });
    }
  } catch (e) { }
}

export async function ensureOllama(mode: "existing" | "minimal" = "existing", onProgress?: (pct: number) => void) {
  const isRunning = await checkOllama();
  if (isRunning) return true;

  const localBin = path.join(BIN_DIR, "ollama.exe");

  // Auto-download minimal binary if missing
  if (mode === "minimal" && !fs.existsSync(localBin)) {
    await downloadOllama(onProgress || (() => {}));
  }

  const binPath = (mode === "minimal" && fs.existsSync(localBin)) ? localBin : "ollama";

  try {
    const child = spawn(binPath, ["serve"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
  } catch (e) {
    return false;
  }

  // Wait for it to start
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (await checkOllama()) return true;
  }

  return false;
}

export async function downloadOllama(onProgress: (percent: number) => void) {
  await fs.ensureDir(BIN_DIR);
  const exePath = path.join(BIN_DIR, "ollama.exe");

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

  // Wait for write to finish
  await new Promise(resolve => writer.on('finish', resolve));
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
