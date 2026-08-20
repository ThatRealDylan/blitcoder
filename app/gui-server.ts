import { serve } from "bun";
import path from "path";
import fs from "fs-extra";
import { handleGUIChat, getGUIHistory, loadGUIChat } from "./api";
import { SETTINGS_PATH } from "./paths";

function getElectronPath(): string {
  const binName = process.platform === "win32" ? "electron.exe" : "electron";
  return path.join(process.cwd(), "node_modules", ".bin", binName);
}

export async function startGUIServer(port: number = 3000) {
  const distDir = path.join(process.cwd(), "gui", "dist");

  if (!fs.existsSync(distDir)) {
    console.error("GUI build not found. Run 'bun run build:gui' after adding the gui frontend, or visit the repo docs for GUI setup.");
    return;
  }

  console.log(`🚀 BlitCoder GUI starting on http://127.0.0.1:${port}`);

  const server = serve({
    port,
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url);
      console.log(`[GUI Server] ${req.method} ${url.pathname}`);

      if (url.pathname.startsWith("/api/")) {
        if (url.pathname === "/api/chat" && req.method === "POST") {
          const body: any = await req.json();
          if (!body || !Array.isArray(body.messages)) {
            return Response.json({ error: "Invalid request body: expected { messages: [...] }" }, { status: 400 });
          }
          const response = await handleGUIChat(body.messages);
          return Response.json(response);
        }
        if (url.pathname === "/api/sessions" && req.method === "GET") {
          const sessions = await getGUIHistory();
          return Response.json(sessions);
        }
        if (url.pathname.startsWith("/api/sessions/") && req.method === "GET") {
          const id = url.pathname.split("/").pop() || "";
          const chat = await loadGUIChat(id);
          return Response.json(chat);
        }
        if (url.pathname === "/api/settings" && req.method === "GET") {
          const settings = fs.readJsonSync(SETTINGS_PATH, { throws: false }) || {};
          return Response.json(settings);
        }
        if (url.pathname === "/api/settings" && req.method === "POST") {
          const body = await req.json();
          if (!body || typeof body !== "object" || Array.isArray(body)) {
            return Response.json({ error: "Invalid request body: expected a settings object" }, { status: 400 });
          }
          const existing = fs.readJsonSync(SETTINGS_PATH, { throws: false }) || {};
          fs.outputJsonSync(SETTINGS_PATH, { ...existing, ...body }, { spaces: 2 });
          return Response.json({ success: true });
        }
        return new Response("Not Found", { status: 404 });
      }

      const relativePath = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      let filePath = path.join(distDir, relativePath);

      if (!fs.existsSync(filePath)) {
        filePath = path.join(distDir, "index.html");
      }

      return new Response(Bun.file(filePath));
    },
  });

  console.log(`✨ Server is ready!`);

  try {
    const { spawn } = await import("child_process");
    const electronPath = getElectronPath();
    const launcherPath = path.join(process.cwd(), "electron-launcher.cjs");

    if (!fs.existsSync(electronPath)) {
      console.log(`Note: Electron not found at ${electronPath}. Open http://127.0.0.1:${port} in your browser.`);
      return server;
    }

    console.log("🚀 Launching BlitCoder Desktop...");
    spawn(electronPath, [launcherPath], {
      detached: true,
      stdio: "ignore",
    }).unref();
  } catch (e) {
    console.log(`Note: Could not launch desktop app. Open http://127.0.0.1:${port} in your browser.`);
  }

  return server;
}
