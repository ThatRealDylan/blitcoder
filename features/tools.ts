import { z } from "zod";
import fs from "fs-extra";
import { execSync } from "child_process";
import path from "path";
import chalk from "chalk";

export const ToolSchemas = {
  read_file: z.object({
    path: z.string().describe("The path to the file to read."),
  }),
  write_file: z.object({
    path: z.string().describe("The path to the file to write."),
    content: z.string().describe("The content to write to the file."),
  }),
  delete_file: z.object({
    path: z.string().describe("The path to the file or directory to delete."),
  }),
  list_dir: z.object({
    path: z.string().describe("The path to the directory to list."),
  }),
  run_command: z.object({
    command: z.string().describe("The shell command to run."),
  }),
};

export class ToolHandler {
  private modifiedFiles: Map<string, { added: number; removed: number }> = new Map();
  private workspaceDir: string | null = null;

  setWorkspace(dir: string | null) {
    this.workspaceDir = dir ? path.resolve(dir) : null;
  }

  private resolvePath(targetPath: string): string {
    const resolved = path.resolve(targetPath);
    if (this.workspaceDir && !resolved.toLowerCase().startsWith(this.workspaceDir.toLowerCase())) {
      throw new Error(`Sandboxed Mode Error: Cannot access path outside of workspace (${this.workspaceDir})`);
    }
    return resolved;
  }

  async execute(name: string, args: any): Promise<string> {
    switch (name) {
      case "read_file":
        return await this.readFile(args.path);
      case "write_file":
        return await this.writeFile(args.path, args.content);
      case "delete_file":
        return await this.deleteFile(args.path);
      case "list_dir":
        return await this.listDir(args.path);
      case "run_command":
        return await this.runCommand(args.command);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private async readFile(filePath: string): Promise<string> {
    try {
      return await fs.readFile(this.resolvePath(filePath), "utf-8");
    } catch (e: any) {
      return `Error reading file: ${e.message}`;
    }
  }

  private async writeFile(filePath: string, content: string): Promise<string> {
    try {
      const resolvedPath = this.resolvePath(filePath);
      let added = 0;
      let removed = 0;

      if (await fs.pathExists(resolvedPath)) {
        const oldContent = await fs.readFile(resolvedPath, "utf-8");
        const oldLines = oldContent.split("\n");
        const newLines = content.split("\n");
        // Simple diff-ish count (very naive)
        added = newLines.length; // Simplified for now
        removed = oldLines.length;
      } else {
        added = content.split("\n").length;
      }

      await fs.outputFile(resolvedPath, content);
      this.modifiedFiles.set(filePath, { added, removed });
      return `Successfully wrote to ${filePath}`;
    } catch (e: any) {
      return `Error writing file: ${e.message}`;
    }
  }

  private async deleteFile(filePath: string): Promise<string> {
    try {
      await fs.remove(this.resolvePath(filePath));
      return `Successfully deleted ${filePath}`;
    } catch (e: any) {
      return `Error deleting file: ${e.message}`;
    }
  }

  private async listDir(dirPath: string): Promise<string> {
    try {
      const files = await fs.readdir(this.resolvePath(dirPath));
      return files.join("\n");
    } catch (e: any) {
      return `Error listing directory: ${e.message}`;
    }
  }

  private async runCommand(command: string): Promise<string> {
    try {
      const options: any = { encoding: "utf-8" };
      if (this.workspaceDir) {
        options.cwd = this.workspaceDir;
      }
      const output = execSync(command, options);
      return output;
    } catch (e: any) {
      return `Error running command: ${e.message}\n${e.stdout || ""}\n${e.stderr || ""}`;
    }
  }

  getLogs(): string[] {
    const logs: string[] = [];
    this.modifiedFiles.forEach((val, key) => {
      logs.push(`[${val.added}+ | ${val.removed}-] ${key}`);
    });
    this.modifiedFiles.clear();
    return logs;
  }
}

export const tools = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write content to a file. Creates directories if they don't exist.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_file",
      description: "Delete a file or directory.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "List the contents of a directory.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Run a shell command. Use with caution.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string" },
        },
        required: ["command"],
      },
    },
  },
] as any[];
