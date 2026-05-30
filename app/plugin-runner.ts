import fs from 'fs-extra';
import path from 'path';
import os from 'os';
// ─── Types ────────────────────────────────────────────────────────────────────

import { PluginHookManager, createSDK } from './plugin-hooks';

export interface PluginConfig {
  name: string;
  id: string;
  version: string;
  description: string;
  author: string;
  license: string;
  'file-modifications-folder': string;
  'scripts-folder': string;
  'data-folder': string;
}

export interface PluginMetadata {
  binded: boolean;
  'git-repo': boolean;
  gitRepo: string;
}

export interface LoadedPlugin {
  name: string;
  pluginDir: string;
  config: PluginConfig;
  metadata: PluginMetadata;
  scripts: string[];    // absolute paths to script files
  mods: string[];       // absolute paths to mod files
  status: 'loaded' | 'error' | 'disabled';
  error?: string;
}

export interface ScriptRunResult {
  pluginName: string;
  scriptName: string;
  success: boolean;
  output?: string;
  error?: string;
}

// ─── Plugin Discovery ─────────────────────────────────────────────────────────

/**
 * Returns all directories that may contain installed plugins.
 * Priority: local project dir first, then user home dir.
 */
function getPluginDirs(): string[] {
  const dirs: string[] = [];

  // Local install: <cwd>/.blitcoder/plugins
  const localPlugins = path.join(process.cwd(), '.blitcoder', 'plugins');
  if (fs.existsSync(localPlugins)) dirs.push(localPlugins);

  // User install: ~/.blitcoder/plugins
  const globalPlugins = path.join(os.homedir(), '.blitcoder', 'plugins');
  if (fs.existsSync(globalPlugins) && globalPlugins !== localPlugins) {
    dirs.push(globalPlugins);
  }

  return dirs;
}

/**
 * Parse a plugin's config.json.
 * Format is an array: ["!@blitcoder.plugin", "!@plugin.data.json", {config}, "!@metadata", {metadata}]
 */
function parsePluginConfig(configPath: string): { config: PluginConfig; metadata: PluginMetadata } | null {
  try {
    const raw = fs.readJsonSync(configPath);
    if (!Array.isArray(raw)) return null;

    // Find config object (after "!@plugin.data.json")
    const configIdx = raw.findIndex((v: any) => v === '!@plugin.data.json');
    const config: PluginConfig = configIdx !== -1 && configIdx + 1 < raw.length ? raw[configIdx + 1] : null;

    // Find metadata object (after "!@metadata")
    const metaIdx = raw.findIndex((v: any) => v === '!@metadata');
    const metadata: PluginMetadata = metaIdx !== -1 && metaIdx + 1 < raw.length ? raw[metaIdx + 1] : { binded: false, 'git-repo': false, gitRepo: 'invalid' };

    if (!config || !config.name) return null;
    return { config, metadata };
  } catch {
    return null;
  }
}

// ─── Load All Plugins ────────────────────────────────────────────────────────

export function discoverPlugins(): LoadedPlugin[] {
  const pluginDirs = getPluginDirs();
  const seen = new Set<string>(); // avoid duplicates by plugin id
  const plugins: LoadedPlugin[] = [];

  for (const dir of pluginDirs) {
    let entries: string[] = [];
    try {
      const allEntries = fs.readdirSync(dir);
      entries = [];
      for (const e of allEntries) {
        try {
          if (fs.statSync(path.join(dir, e)).isDirectory()) entries.push(e);
        } catch { /* race: entry removed between readdir and stat */ }
      }
    } catch { continue; }

    for (const entry of entries) {
      const pluginDir = path.join(dir, entry);
      const configPath = path.join(pluginDir, 'config.json');

      if (!fs.existsSync(configPath)) continue;

      const parsed = parsePluginConfig(configPath);
      if (!parsed) {
        plugins.push({
          name: entry,
          pluginDir,
          config: {} as PluginConfig,
          metadata: {} as PluginMetadata,
          scripts: [],
          mods: [],
          status: 'error',
          error: 'Invalid or missing config.json'
        });
        continue;
      }

      const { config, metadata } = parsed;

      // Skip duplicates (prefer local over global)
      if (seen.has(config.id)) continue;
      seen.add(config.id);

      // Resolve script files
      const scriptsFolder = path.join(pluginDir, config['scripts-folder'] || 'scripts');
      let scripts: string[] = [];
      if (fs.existsSync(scriptsFolder)) {
        try {
          scripts = fs.readdirSync(scriptsFolder)
            .filter(f => f.endsWith('.js') || f.endsWith('.mjs') || f.endsWith('.ts'))
            .map(f => path.join(scriptsFolder, f));
        } catch { }
      }

      // Resolve mod files (UI .tsx / .jsx)
      const modsFolder = path.join(pluginDir, config['file-modifications-folder'] || 'mods');
      let mods: string[] = [];
      if (fs.existsSync(modsFolder)) {
        try {
          mods = fs.readdirSync(modsFolder)
            .filter(f => f.endsWith('.tsx') || f.endsWith('.jsx') || f.endsWith('.js'))
            .map(f => path.join(modsFolder, f));
        } catch { }
      }

      plugins.push({
        name: config.name,
        pluginDir,
        config,
        metadata,
        scripts,
        mods,
        status: 'loaded'
      });
    }
  }

  return plugins;
}

// ─── Run a Plugin's Scripts ──────────────────────────────────────────────────

/**
 * Run all scripts for a single plugin.
 * Each script should export a `runScript(pluginPath: string, sdk: PluginSDK)` function.
 */
export async function runPluginScripts(plugin: LoadedPlugin): Promise<ScriptRunResult[]> {
  const results: ScriptRunResult[] = [];
  const sdk = createSDK(plugin.name, plugin.pluginDir, plugin.config);
  const hookMgr = PluginHookManager.getInstance();

  for (const scriptPath of plugin.scripts) {
    const scriptName = path.basename(scriptPath);
    try {
      // Dynamically import the script (works natively in Bun)
      const mod = await import(scriptPath);

      // Register hooks if exported
      if (typeof mod.onInit === 'function') hookMgr.addInitHook(mod.onInit);
      if (typeof mod.onMessage === 'function') hookMgr.addMessageHook(mod.onMessage);
      if (typeof mod.onToolCall === 'function') hookMgr.addToolCallHook(mod.onToolCall);
      if (typeof mod.onExit === 'function') hookMgr.addExitHook(mod.onExit);

      if (typeof mod.runScript === 'function') {
        // Capture console output by temporarily overriding console.log
        const logs: string[] = [];
        const origLog = console.log;
        const origError = console.error;
        console.log = (...args: any[]) => logs.push(args.map(String).join(' '));
        console.error = (...args: any[]) => logs.push('[ERROR] ' + args.map(String).join(' '));

        try {
          await mod.runScript(plugin.pluginDir, sdk);
        } finally {
          console.log = origLog;
          console.error = origError;
        }

        results.push({
          pluginName: plugin.name,
          scriptName,
          success: true,
          output: logs.join('\n') || '(no output)'
        });
      } else {
        // Even if there's no runScript, it might just register hooks, which is valid.
        results.push({
          pluginName: plugin.name,
          scriptName,
          success: true,
          output: 'Hooks registered (no runScript)'
        });
      }
    } catch (err: any) {
      results.push({
        pluginName: plugin.name,
        scriptName,
        success: false,
        error: err.message || String(err)
      });
    }
  }

  return results;
}

/**
 * Run all scripts across all provided plugins.
 */
export async function runAllPluginScripts(plugins: LoadedPlugin[]): Promise<ScriptRunResult[]> {
  const allResults: ScriptRunResult[] = [];
  for (const plugin of plugins) {
    if (plugin.status !== 'loaded') continue;
    const results = await runPluginScripts(plugin);
    allResults.push(...results);
  }
  return allResults;
}

// ─── Startup Runner ──────────────────────────────────────────────────────────

/**
 * Discover all plugins and auto-run their startup scripts.
 * Returns the discovered plugins and script results.
 */
export async function initPlugins(): Promise<{
  plugins: LoadedPlugin[];
  scriptResults: ScriptRunResult[];
}> {
  const plugins = discoverPlugins();
  const scriptResults = await runAllPluginScripts(plugins);
  
  // Trigger onInit hooks for all registered plugins
  const hookMgr = PluginHookManager.getInstance();
  for (const plugin of plugins) {
    if (plugin.status !== 'loaded') continue;
    const sdk = createSDK(plugin.name, plugin.pluginDir, plugin.config);
    await hookMgr.triggerInit(sdk);
  }

  return { plugins, scriptResults };
}

// ─── Format Helpers ──────────────────────────────────────────────────────────

export function formatPluginList(plugins: LoadedPlugin[]): string {
  if (plugins.length === 0) return 'No plugins installed.';
  return plugins
    .map(p => {
      const icon = p.status === 'loaded' ? '✅' : '❌';
      const scripts = p.scripts.length > 0 ? ` [${p.scripts.length} script${p.scripts.length > 1 ? 's' : ''}]` : '';
      const mods = p.mods.length > 0 ? ` [${p.mods.length} mod${p.mods.length > 1 ? 's' : ''}]` : '';
      return `${icon} ${p.name} v${p.config.version || '?'} by ${p.config.author || '?'}${scripts}${mods}`;
    })
    .join('\n');
}

export function formatScriptResults(results: ScriptRunResult[]): string {
  if (results.length === 0) return 'No scripts were run.';
  return results
    .map(r => {
      if (r.success) {
        return `✅ [${r.pluginName}] ${r.scriptName}\n   Output: ${r.output}`;
      } else {
        return `❌ [${r.pluginName}] ${r.scriptName}\n   Error: ${r.error}`;
      }
    })
    .join('\n');
}

// ─── Mod Component Loader ───────────────────────────────────────────────────

/**
 * Dynamically imports all exported components/functions from a plugin's mods folder.
 */
export async function loadPluginMods(plugin: LoadedPlugin): Promise<Record<string, React.ComponentType<any>>> {
  const components: Record<string, React.ComponentType<any>> = {};
  if (plugin.status !== 'loaded') return components;

  for (const modPath of plugin.mods) {
    try {
      const exported = await import(modPath);
      for (const [key, value] of Object.entries(exported)) {
        // React components are functions (functional or class) with PascalCase names
        if (/^[A-Z]/.test(key) && typeof value === 'function') {
          components[key] = value as React.ComponentType<any>;
        }
      }
    } catch (err) {
      // Quietly ignore import/compilation errors for mods
    }
  }

  return components;
}

/**
 * Loads all mod components from all active plugins.
 */
export async function loadAllPluginMods(plugins: LoadedPlugin[]): Promise<Record<string, React.ComponentType<any>>> {
  let allComponents: Record<string, React.ComponentType<any>> = {};
  for (const plugin of plugins) {
    const components = await loadPluginMods(plugin);
    // Prefix keys with plugin name to avoid collisions
    for (const [key, value] of Object.entries(components)) {
      const prefixedKey = `${plugin.name}:${key}`;
      if (allComponents[prefixedKey]) {
        console.warn(`Plugin component name collision: "${prefixedKey}" from plugin "${plugin.name}" overwrites existing`);
      }
      allComponents[prefixedKey] = value;
    }
  }
  return allComponents;
}

