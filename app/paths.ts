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
