import { serve } from "bun";
import path from "path";
import fs from "fs-extra";
import { handleGUIChat, getGUIHistory, loadGUIChat } from "./api";
import { SETTINGS_PATH } from "./paths";

export async function startGUIServer(port: number = 3000) {
  const distDir = path.join(process.cwd(), "gui", "dist");
  
  if (!fs.existsSync(distDir)) {
    console.error("GUI build not found. Please run 'bun run build' in the 'gui' directory first.");
    return;
  }

  console.log(`🚀 BlitCoder GUI starting on http://localhost:${port}`);

  const server = serve({
    port,
    hostname: "0.0.0.0",
    async fetch(req) {
      const url = new URL(req.url);
      console.log(`[GUI Server] ${req.method} ${url.pathname}`);

      // API Routes
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
          if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return Response.json({ error: "Invalid request body: expected a settings object" }, { status: 400 });
          }
          const existing = fs.readJsonSync(SETTINGS_PATH, { throws: false }) || {};
          fs.outputJsonSync(SETTINGS_PATH, { ...existing, ...body }, { spaces: 2 });
          return Response.json({ success: true });
        }
        return new Response("Not Found", { status: 404 });
      }

      // Static Files
      const relativePath = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      let filePath = path.join(distDir, relativePath);
      
      if (!fs.existsSync(filePath)) {
        filePath = path.join(distDir, "index.html"); // SPA Fallback
      }

      return new Response(Bun.file(filePath));
    },
  });

  console.log(`✨ Server is ready!`);

  // Launch Electron shell
  try {
    const { spawn } = await import("child_process");
    const electronPath = path.join(process.cwd(), "node_modules", ".bin", "electron.exe");
    const launcherPath = path.join(process.cwd(), "electron-launcher.cjs");
    
    console.log("🚀 Launching BlitCoder Desktop...");
    spawn(electronPath, [launcherPath], {
      detached: true,
      stdio: 'ignore'
    }).unref();
    
  } catch (e) {
    console.log(`Note: Could not automatically launch desktop app. Please visit http://localhost:${port} manually.`);
  }
}
