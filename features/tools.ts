import { z } from "zod";
import fs from "fs-extra";
import { execSync } from "child_process";
import path from "path";

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
  grep_search: z.object({
    query: z.string().describe("The text or regex pattern to search for."),
    path: z.string().optional().describe("Directory or file to search in (defaults to workspace root)."),
  }),
};

const DANGEROUS_TOOLS = new Set(["run_command", "delete_file"]);

export function isDangerousTool(name: string): boolean {
  return DANGEROUS_TOOLS.has(name);
}

export class ToolHandler {
  private modifiedFiles: Map<string, { added: number; removed: number }> = new Map();
  private workspaceDir: string | null = null;

  setWorkspace(dir: string | null) {
    this.workspaceDir = dir ? path.resolve(dir) : null;
  }

  private resolvePath(targetPath: string): string {
    const base = this.workspaceDir || process.cwd();
    const resolved = path.resolve(base, targetPath);

    if (this.workspaceDir) {
      const workspaceRoot = path.resolve(this.workspaceDir);
      const relative = path.relative(workspaceRoot, resolved);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error(`Sandboxed Mode Error: Cannot access path outside of workspace (${workspaceRoot})`);
      }
    }

    return resolved;
  }

  async execute(name: string, args: any): Promise<string> {
    const schema = ToolSchemas[name as keyof typeof ToolSchemas];
    if (!schema) {
      throw new Error(`Unknown tool: ${name}`);
    }

    switch (name) {
      case "read_file": {
        const parsed = ToolSchemas.read_file.parse(args);
        return await this.readFile(parsed.path);
      }
      case "write_file": {
        const parsed = ToolSchemas.write_file.parse(args);
        return await this.writeFile(parsed.path, parsed.content);
      }
      case "delete_file": {
        const parsed = ToolSchemas.delete_file.parse(args);
        return await this.deleteFile(parsed.path);
      }
      case "list_dir": {
        const parsed = ToolSchemas.list_dir.parse(args);
        return await this.listDir(parsed.path);
      }
      case "run_command": {
        const parsed = ToolSchemas.run_command.parse(args);
        return await this.runCommand(parsed.command);
      }
      case "grep_search": {
        const parsed = ToolSchemas.grep_search.parse(args);
        return await this.grepSearch(parsed.query, parsed.path);
      }
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
        added = Math.max(0, newLines.length - oldLines.length);
        removed = Math.max(0, oldLines.length - newLines.length);
        if (added === 0 && removed === 0 && oldContent !== content) {
          added = 1;
          removed = 1;
        }
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
      const options: { encoding: "utf-8"; cwd?: string } = { encoding: "utf-8" };
      if (this.workspaceDir) {
        options.cwd = this.workspaceDir;
      }
      const output = execSync(command, options);
      return output;
    } catch (e: any) {
      return `Error running command: ${e.message}\n${e.stdout || ""}\n${e.stderr || ""}`;
    }
  }

  private async grepSearch(query: string, searchPath?: string): Promise<string> {
    try {
      const root = this.resolvePath(searchPath || ".");
      const results: string[] = [];
      const pattern = new RegExp(query, "i");

      const walk = async (dir: string) => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name === "node_modules" || entry.name === ".git") continue;
            await walk(fullPath);
          } else if (entry.isFile()) {
            try {
              const content = await fs.readFile(fullPath, "utf-8");
              const lines = content.split("\n");
              lines.forEach((line, idx) => {
                if (pattern.test(line)) {
                  results.push(`${fullPath}:${idx + 1}: ${line.trim()}`);
                }
              });
            } catch (e) { /* skip binary/unreadable files */ }
          }
        }
      };

      if ((await fs.stat(root)).isFile()) {
        const content = await fs.readFile(root, "utf-8");
        content.split("\n").forEach((line, idx) => {
          if (pattern.test(line)) results.push(`${root}:${idx + 1}: ${line.trim()}`);
        });
      } else {
        await walk(root);
      }

      if (results.length === 0) return `No matches for "${query}"`;
      if (results.length > 100) {
        return results.slice(0, 100).join("\n") + `\n... (${results.length - 100} more matches truncated)`;
      }
      return results.join("\n");
    } catch (e: any) {
      return `Error searching: ${e.message}`;
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
  {
    type: "function",
    function: {
      name: "grep_search",
      description: "Search for a text pattern in files within the workspace.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          path: { type: "string" },
        },
        required: ["query"],
      },
    },
  },
] as any[];
