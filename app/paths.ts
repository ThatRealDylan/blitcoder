import os from "os";
import path from "path";
import fs from "fs-extra";

export const GLOBAL_DIR = path.join(os.homedir(), ".blitcoder");
export const GET_LOCAL_DIR = (cwd: string) => path.join(cwd, ".blitcoder");

fs.ensureDirSync(GLOBAL_DIR);

export const SETTINGS_PATH = path.join(GLOBAL_DIR, "settings.json");
export const MEMORY_PATH = path.join(GLOBAL_DIR, "memory.json");
export const BIN_DIR = path.join(GLOBAL_DIR, "bin");
export const LOCAL_MODELS_PATH = path.join(GLOBAL_DIR, "local_models.json");

export const GET_CHATS_DIR = (cwd: string) => path.join(GET_LOCAL_DIR(cwd), "chats");

/** Resolve initial workspace from settings and cwd. */
export function resolveWorkspace(cwd: string, homeDir: string): string | null {
  const isHomeDir = cwd.toLowerCase() === homeDir.toLowerCase();
  let workspaceMode = "sandboxed";

  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const settings = fs.readJsonSync(SETTINGS_PATH);
      workspaceMode = settings["Workspace Mode"] || "sandboxed";
    }
  } catch (e) { /* use default */ }

  if (workspaceMode === "unsandboxed") return null;
  if (isHomeDir) return null;
  return cwd;
}

export function getPluginInstallDir(): string {
  let settings: Record<string, unknown> = {};
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      settings = fs.readJsonSync(SETTINGS_PATH);
    }
  } catch (e) { /* ignore */ }

  if (settings["Plugin Install Location"] === "User folder") {
    return path.join(os.homedir(), ".blitcoder", "plugins");
  }
  return path.join(process.cwd(), ".blitcoder", "plugins");
}

/** Cross-platform zip extraction using built-in OS tools. */
export async function extractZipArchive(zipPath: string, destDir: string): Promise<void> {
  await fs.ensureDir(destDir);

  if (process.platform === "win32") {
    const { spawn } = await import("child_process");
    await new Promise<void>((resolve, reject) => {
      const ps = spawn(
        "powershell",
        ["-Command", `Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force`],
        { stdio: "pipe" }
      );
      ps.on("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Expand-Archive failed (exit ${code})`));
      });
    });
    return;
  }

  const { execSync } = await import("child_process");
  try {
    execSync(`unzip -o -q "${zipPath}" -d "${destDir}"`, { stdio: "pipe" });
  } catch (e) {
    execSync(`tar -xf "${zipPath}" -C "${destDir}"`, { stdio: "pipe" });
  }
}
