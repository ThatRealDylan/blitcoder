import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { getPluginInstallDir, extractZipArchive } from './paths';

export const PluginCreateMenu = ({ onExit }: { onExit: () => void }) => {
  const [step, setStep] = useState(0);
  const [data, setData] = useState({
    name: '',
    description: '',
    version: '1.0.0',
    gitRepo: '',
    license: 'MIT',
    author: process.env.USERNAME || 'Author'
  });
  const [error, setError] = useState('');

  const steps = [
    { key: 'name', prompt: 'Plugin Name:' },
    { key: 'description', prompt: 'Description:' },
    { key: 'version', prompt: 'Version (e.g. 1.0.0):' },
    { key: 'gitRepo', prompt: 'Git Project URL (Optional):' },
    { key: 'license', prompt: 'License (Optional, e.g. MIT):' },
    { key: 'author', prompt: 'Author:' }
  ];

  const handleSubmit = (value: string) => {
    const currentStep = steps[step]!;
    setData(prev => ({ ...prev, [currentStep.key]: value }));
    
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      // Finalize creation
      const pluginData = { ...data, [currentStep.key]: value };
      
      if (!pluginData.name) {
        setError("Plugin Name is required!");
        setStep(0);
        return;
      }

      const pluginDir = path.join(process.cwd(), pluginData.name);
      
      try {
        if (fs.existsSync(pluginDir)) {
          setError(`Directory ${pluginData.name} already exists!`);
          return;
        }

        fs.ensureDirSync(pluginDir);
        fs.ensureDirSync(path.join(pluginDir, 'mods'));
        fs.ensureDirSync(path.join(pluginDir, 'scripts'));
        fs.ensureDirSync(path.join(pluginDir, 'data'));
        
        fs.writeFileSync(path.join(pluginDir, 'README.md'), `# ${pluginData.name}\n${pluginData.description}`);
        
        const config = [
          "!@blitcoder.plugin",
          "!@plugin.data.json",
          {
            name: pluginData.name,
            id: `${pluginData.author.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}.${pluginData.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`,
            version: pluginData.version || "1.0.0",
            description: pluginData.description,
            author: pluginData.author,
            license: pluginData.license,
            "file-modifications-folder": "mods",
            "scripts-folder": "scripts",
            "data-folder": "data"
          },
          "!@metadata",
          {
            binded: true,
            "git-repo": !!pluginData.gitRepo,
            gitRepo: pluginData.gitRepo || "invalid"
          }
        ];
        
        fs.outputJsonSync(path.join(pluginDir, 'config.json'), config, { spaces: 4 });
        
        onExit();
      } catch (err: any) {
        setError(err.message);
      }
    }
  };

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error: {error}</Text>
        <Box marginTop={1}>
          <Text color="gray">Press Enter to exit.</Text>
          <TextInput value="" onChange={() => {}} onSubmit={onExit} />
        </Box>
      </Box>
    );
  }

  const currentStep = steps[step]!;

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">🔌 BlitCoder Plugin Setup</Text>
      <Box marginTop={1} flexDirection="column">
        {steps.slice(0, step).map((s, i) => (
          <Text key={s.key} color="gray">✓ {s.prompt} {(data as any)[s.key]}</Text>
        ))}
        <Box flexDirection="row">
          <Text color="yellow">❯ {currentStep.prompt} </Text>
          <TextInput 
            value={(data as any)[currentStep.key]} 
            onChange={(val) => setData(prev => ({ ...prev, [currentStep.key]: val }))} 
            onSubmit={handleSubmit} 
          />
        </Box>
      </Box>
    </Box>
  );
};

export const PluginImportMenu = ({ onExit }: { onExit: () => void }) => {
  const [pathInput, setPathInput] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const handleImport = (val: string) => {
    if (!val) {
      onExit();
      return;
    }
    
    try {
      const sourcePath = path.resolve(val);
      if (!fs.existsSync(sourcePath)) {
        setError(`Path not found: ${sourcePath}`);
        return;
      }
      
      const configPath = path.join(sourcePath, 'config.json');
      if (!fs.existsSync(configPath)) {
        setError(`Not a valid plugin. Missing config.json at ${sourcePath}`);
        return;
      }
      
      // We assume they want to import it into their global plugins folder.
      // Usually located at ~/.blitcoder/plugins or determined by their settings.
      const settingsPath = path.join(os.homedir(), '.blitcoder', 'settings.json');
      let installLoc = "BlitCoder Install";
      try {
        if (fs.existsSync(settingsPath)) {
          const settings = fs.readJsonSync(settingsPath);
          installLoc = settings["Plugin Install Location"] || "BlitCoder Install";
        }
      } catch (e) {}

      let targetDir = getPluginInstallDir();
      
      const pluginName = path.basename(sourcePath);
      const destPath = path.join(targetDir, pluginName);
      
      fs.ensureDirSync(targetDir);
      fs.copySync(sourcePath, destPath);
      
      setStatus(`Successfully imported plugin to ${destPath}`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (status) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="green">{status}</Text>
        <Box marginTop={1}>
          <TextInput value="" onChange={() => {}} onSubmit={onExit} />
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error: {error}</Text>
        <Box marginTop={1}>
          <Text color="gray">Press Enter to exit.</Text>
          <TextInput value="" onChange={() => {}} onSubmit={onExit} />
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1} borderStyle="double" borderColor="red">
      <Text bold color="red">⚠️ WARNING: Third-Party Plugins</Text>
      <Text>Installing third-party plugins can be dangerous.</Text>
      <Text>Plugins can execute arbitrary code and modify your system.</Text>
      <Text>BlitCoder is <Text bold>NOT</Text> responsible for any damage caused by external plugins.</Text>
      
      <Box marginTop={1} flexDirection="row">
        <Text color="yellow">Enter Plugin Folder Path (or empty to cancel): </Text>
        <TextInput value={pathInput} onChange={setPathInput} onSubmit={handleImport} />
      </Box>
    </Box>
  );
};

const FEATURED_PLUGINS_URL = "https://blitinstall.workers.dev/plugins/plugins.json";

export const PluginFeaturedMenu = ({ onExit }: { onExit: () => void }) => {
  const [plugins, setPlugins] = useState<any[]>([]);
  const [cursor, setCursor] = useState(0);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    fetch(FEATURED_PLUGINS_URL)
      .then(r => r.json())
      .then((data: any) => {
        if (data.plugins && data.plugins.length > 0) {
          setPlugins(data.plugins);
          setStatus('select');
        } else {
          setError('No featured plugins available');
          setStatus('done');
        }
      })
      .catch(e => {
        setError(`Failed to fetch plugins: ${e.message}`);
        setStatus('done');
      });
  }, []);

  useInput((input, key) => {
    if (status === 'select') {
      if (key.upArrow) setCursor(c => Math.max(0, c - 1));
      if (key.downArrow) setCursor(c => Math.min(plugins.length - 1, c + 1));
      if (key.return && plugins[cursor]) install(plugins[cursor]);
      if (key.escape) onExit();
    }
    if (status === 'done') {
      if (key.return) onExit();
    }
    if (status === 'installed') {
      if (key.return) onExit();
    }
  });

  const install = async (plugin: any) => {
    setInstalling(true);
    try {
      const baseUrl = "https://blitinstall.workers.dev";
      const res = await fetch(`${baseUrl}${plugin.url}`);
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const zipBuf = await res.arrayBuffer();

      const pluginsRoot = getPluginInstallDir();
      fs.ensureDirSync(pluginsRoot);
      const pluginDir = path.join(pluginsRoot, plugin.id);
      const zipPath = path.join(pluginsRoot, `${plugin.id}.zip`);

      fs.writeFileSync(zipPath, Buffer.from(zipBuf));
      fs.ensureDirSync(pluginDir);
      await extractZipArchive(zipPath, pluginDir);
      fs.removeSync(zipPath);

      setStatus('installed');
      setInstalling(false);
    } catch (e: any) {
      setError(`Install failed: ${e.message}`);
      setInstalling(false);
    }
  };

  if (status === 'loading') {
    return (
      <Box padding={1}>
        <Text>Loading featured plugins...</Text>
      </Box>
    );
  }

  if (installing) {
    return (
      <Box padding={1}>
        <Text>Installing plugin...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">{error}</Text>
        <Box marginTop={1}>
          <Text color="gray">Press Enter to exit.</Text>
        </Box>
      </Box>
    );
  }

  if (status === 'installed') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="green">Plugin installed successfully!</Text>
        <Text color="gray">Restart BlitCoder to load the new plugin.</Text>
        <Box marginTop={1}>
          <Text color="gray">Press Enter to exit.</Text>
        </Box>
      </Box>
    );
  }

  if (status === 'select') {
    return (
      <Box flexDirection="column" padding={1} borderStyle="double" borderColor="cyan">
        <Text bold color="cyan">Featured Plugins</Text>
        <Box marginTop={1} flexDirection="column">
          {plugins.map((p, i) => (
            <Text key={p.id} color={i === cursor ? 'cyan' : undefined}>
              {i === cursor ? '> ' : '  '}{p.name} <Text color="gray">- {p.description}</Text>
            </Text>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text color="gray">↑↓ navigate, Enter install, Esc exit</Text>
        </Box>
      </Box>
    );
  }

  return null;
};
