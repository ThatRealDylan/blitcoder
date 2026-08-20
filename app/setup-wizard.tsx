import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Text, Box, useInput } from 'ink';
import TextInput from 'ink-text-input';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { SETTINGS_PATH, extractZipArchive } from './paths';

type StepType = 'welcome' | 'ollama' | 'workspaces' | 'ai-provider' | 'extra-settings' | 'installation';

interface SetupData {
  ollama: 'existing' | 'minimal' | null;
  workspace: 'unsandboxed' | 'sandboxed' | null;
  aiProvider: 'openai' | 'gemini' | 'deepseek' | 'qwen' | 'ollama' | 'skip' | null;
  apiKey: string;
  defaultModel: string;
  truncation: 'on+' | 'on' | 'off' | 'skip';
  systemPrompt: string | null;
  selectedReleaseIndex: number;
  installLocation: string;
  customLocation: string;
}

interface GitHubRelease {
  tag_name: string;
  name: string;
  prerelease: boolean;
  zipball_url: string;
  html_url: string;
}

type StepComponentProps = {
  data: SetupData;
  updateData: (updates: Partial<SetupData>) => void;
  onNext: () => void;
  onBack?: () => void;
  releases: GitHubRelease[];
  setReleases: (r: GitHubRelease[]) => void;
  installProgress: number;
  setInstallProgress: (p: number) => void;
  installStatus: string;
  setInstallStatus: (s: string) => void;
};

const USER_FOLDER = os.homedir();

const asciiLogo = (() => {
  try {
    const content = fs.readFileSync(path.join(__dirname, 'ascii.txt'), 'utf-8');
    const lines = content.split('\n');
    return { green: lines.slice(0, 3), blue: lines.slice(3, 6) };
  } catch { return null; }
})();

const StepIndicator = ({ current }: { current: StepType }) => {
  const order: StepType[] = ['ollama', 'workspaces', 'ai-provider', 'extra-settings', 'installation'];
  const labels: Record<string, string> = {
    ollama: 'Ollama', workspaces: 'Workspaces', 'ai-provider': 'AI Provider',
    'extra-settings': 'Extra Settings', installation: 'Installation',
  };
  if (current === 'welcome') return null;
  return (
    <Box>
      <Text>   </Text>
      {order.map((s, i) => (
        <Text key={s}>
          <Text color={s === current ? 'blue' : 'gray'}>{labels[s]}</Text>
          {i < order.length - 1 && <Text color="gray"> {'>'} </Text>}
        </Text>
      ))}
    </Box>
  );
};

const ProgressBar = ({ pct }: { pct: number }) => {
  const width = 30;
  const filled = Math.round((pct / 100) * width);
  return (
    <Text>
      <Text color="cyan">[</Text>
      <Text color="green">{'='.repeat(filled)}</Text>
      <Text color="gray">{' '.repeat(width - filled)}</Text>
      <Text color="cyan">] </Text>
      <Text color="white">{pct}%</Text>
    </Text>
  );
};

const WelcomeStep = ({ onNext }: { onNext: (mode: 'now' | 'later') => void }) => {
  const [cursor, setCursor] = useState(0);

  useInput((_input, key) => {
    if (key.upArrow) setCursor(0);
    if (key.downArrow) setCursor(1);
    if (key.return) onNext(cursor === 0 ? 'now' : 'later');
  });

  return (
    <Box flexDirection="column" paddingX={1} paddingTop={1}>
      {asciiLogo && (
        <Box flexDirection="column">
          {asciiLogo.green.map((l, i) => <Text key={`g${i}`} color="green">{l}</Text>)}
          {asciiLogo.blue.map((l, i) => <Text key={`b${i}`} color="blue">{l}</Text>)}
        </Box>
      )}
      <Text>Welcome to the BlitCoder Setup! How would you like to proceed?</Text>
      <Box flexDirection="column" marginTop={1}>
        <Text color={cursor === 0 ? 'cyan' : undefined}>
          {cursor === 0 ? '> ' : '  '}Setup Now - Start the setup.
        </Text>
        <Text color={cursor === 1 ? 'cyan' : undefined}>
          {cursor === 1 ? '> ' : '  '}Setup Later - Skip to the installation.
        </Text>
      </Box>
    </Box>
  );
};

const OllamaStep = ({ data, updateData, onNext }: StepComponentProps) => {
  const [cursor, setCursor] = useState(data.ollama === 'existing' ? 0 : data.ollama === 'minimal' ? 1 : 0);
  const options = [
    { key: 'existing' as const, label: 'System' },
    { key: 'minimal' as const, label: 'Minimal' },
  ];

  useInput((_input, key) => {
    if (key.upArrow) setCursor(Math.max(0, cursor - 1));
    if (key.downArrow) setCursor(Math.min(options.length - 1, cursor + 1));
    if (key.return && options[cursor]) {
      updateData({ ollama: options[cursor].key });
      onNext();
    }
  });

  return (
    <Box flexDirection="column" paddingX={1} paddingTop={1}>
      <Text bold>Ollama Instance:</Text>
      <Text>Would you like to use your System Ollama or a minimal Ollama?</Text>
      <Box flexDirection="column" marginTop={1}>
        {options.map((opt, i) => (
          <Text key={opt.key} color={i === cursor ? 'cyan' : undefined}>
            {i === cursor ? '> ' : '  '}{opt.label}
          </Text>
        ))}
      </Box>
    </Box>
  );
};

const WorkspacesStep = ({ data, updateData, onNext }: StepComponentProps) => {
  const [cursor, setCursor] = useState(data.workspace === 'unsandboxed' ? 0 : data.workspace === 'sandboxed' ? 1 : 0);
  const options = [
    { key: 'unsandboxed' as const, label: 'Unsandboxed' },
    { key: 'sandboxed' as const, label: 'Sandboxed' },
  ];

  useInput((_input, key) => {
    if (key.upArrow) setCursor(Math.max(0, cursor - 1));
    if (key.downArrow) setCursor(Math.min(options.length - 1, cursor + 1));
    if (key.return && options[cursor]) {
      updateData({ workspace: options[cursor].key });
      onNext();
    }
  });

  return (
    <Box flexDirection="column" paddingX={1} paddingTop={1}>
      <Text bold>Workspaces:</Text>
      <Text>What do you want the AI to access?</Text>
      <Box flexDirection="column" marginTop={1}>
        <Text color={cursor === 0 ? 'cyan' : undefined}>
          {cursor === 0 ? '> ' : '  '}Unsandboxed - Full machine access (Not Recommended)
        </Text>
        <Text color={cursor === 1 ? 'cyan' : undefined}>
          {cursor === 1 ? '> ' : '  '}Sandboxed - Only current workspace
        </Text>
      </Box>
    </Box>
  );
};

const AIProviderStep = ({ data, updateData, onNext }: StepComponentProps) => {
  const [cursor, setCursor] = useState(0);
  const [showApiInput, setShowApiInput] = useState(false);
  const [apiInput, setApiInput] = useState(data.apiKey || '');
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

  const providers = ['OpenAI', 'Gemini', 'DeepSeek', 'Qwen', 'Ollama'];
  const providerKeys = ['openai', 'gemini', 'deepseek', 'qwen', 'ollama'];

  useInput((_input, key) => {
    if (showApiInput) {
      if (key.return) {
        updateData({ apiKey: apiInput, aiProvider: selectedProvider as any });
        onNext();
      }
      return;
    }
    if (key.upArrow) setCursor(Math.max(0, cursor - 1));
    if (key.downArrow) setCursor(Math.min(providers.length, cursor + 1));
    if (key.return) {
      if (cursor === providers.length) {
        updateData({ aiProvider: 'skip', apiKey: '' });
        onNext();
        return;
      }
      if (!providers[cursor]) return;
      setSelectedProvider(providerKeys[cursor]!);
      setShowApiInput(true);
    }
  });

  if (showApiInput) {
    return (
      <Box flexDirection="column" paddingX={1} paddingTop={1}>
        <Text bold>API Key:</Text>
        <Text>Enter your {selectedProvider} API Key.</Text>
        <Box marginTop={1}>
          <Text>&gt; </Text>
          <TextInput value={apiInput} onChange={setApiInput} placeholder="Paste your API key..." />
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1} paddingTop={1}>
      <Text bold>AI Provider:</Text>
      <Text>Select an AI Provider.</Text>
      <Box flexDirection="column" marginTop={1}>
        {providers.map((label, i) => (
          <Text key={label} color={i === cursor ? 'cyan' : undefined}>
            {i === cursor ? '> ' : '  '}{label}
          </Text>
        ))}
        <Text color={cursor === providers.length ? 'cyan' : undefined}>
          {cursor === providers.length ? '> ' : '  '}Skip This Step
        </Text>
      </Box>
    </Box>
  );
};

const ExtraSettingsStep = ({ data, updateData, onNext }: StepComponentProps) => {
  const [subStep, setSubStep] = useState(0);
  const [modelInput, setModelInput] = useState(data.defaultModel || '');
  const [truncCursor, setTruncCursor] = useState(0);
  const [waitingForPrompt, setWaitingForPrompt] = useState(false);
  const [cursor, setCursor] = useState(0);

  useInput((_input, key) => {
    if (waitingForPrompt) {
      if (key.return) {
        const sysPromptPath = path.join(os.homedir(), 'blitcodersysprompt.txt');
        if (fs.existsSync(sysPromptPath)) {
          updateData({ systemPrompt: fs.readFileSync(sysPromptPath, 'utf-8') });
          fs.removeSync(sysPromptPath);
          setWaitingForPrompt(false);
          onNext();
        }
      }
      return;
    }

    if (subStep === 0) {
      if (data.aiProvider === 'ollama' || data.aiProvider === null) {
        if (key.return) {
          updateData({ defaultModel: modelInput || 'None' });
          setSubStep(1);
        }
        return;
      }
      updateData({ defaultModel: 'None' });
      setSubStep(1);
      return;
    }

    if (subStep === 1) {
      if (key.upArrow) setTruncCursor(Math.max(0, truncCursor - 1));
      if (key.downArrow) setTruncCursor(Math.min(3, truncCursor + 1));
      if (key.return) {
        updateData({ truncation: (['on+', 'on', 'off', 'skip'] as const)[truncCursor] });
        setSubStep(2);
      }
      return;
    }

    if (subStep === 2) {
      if (key.upArrow) setCursor(Math.max(0, cursor - 1));
      if (key.downArrow) setCursor(Math.min(1, cursor + 1));
      if (key.return) {
        if (cursor === 0) {
          const sysPromptPath = path.join(os.homedir(), 'blitcodersysprompt.txt');
          setWaitingForPrompt(true);
          if (process.platform === 'win32') {
            spawn('notepad', [sysPromptPath], { shell: true });
          } else {
            spawn('nano', [sysPromptPath], { stdio: 'inherit', shell: true });
          }
        } else {
          onNext();
        }
      }
    }
  });

  if (waitingForPrompt) {
    return (
      <Box flexDirection="column" paddingX={1} paddingTop={1}>
        <Text bold>System Prompt:</Text>
        <Text>Waiting for you to save blitcodersysprompt.txt in your user folder...</Text>
        <Text>Press Enter once saved.</Text>
      </Box>
    );
  }

  if (subStep === 0 && (data.aiProvider === 'ollama' || data.aiProvider === null)) {
    return (
      <Box flexDirection="column" paddingX={1} paddingTop={1}>
        <Text bold>Default AI Model:</Text>
        <Box marginTop={1}>
          <Text>&gt; </Text>
          <TextInput value={modelInput} onChange={setModelInput} placeholder="Enter model name..." />
        </Box>
      </Box>
    );
  }

  if (subStep === 1) {
    return (
      <Box flexDirection="column" paddingX={1} paddingTop={1}>
        <Text bold>Truncation:</Text>
        {['ON+', 'ON', 'OFF', 'Skip this step'].map((label, i) => (
          <Text key={label} color={i === truncCursor ? 'cyan' : undefined}>
            {i === truncCursor ? '> ' : '  '}{label}
          </Text>
        ))}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1} paddingTop={1}>
      <Text bold>System Prompt:</Text>
      <Text>Would you like to edit the BlitCoder System Prompt?</Text>
      <Box flexDirection="column" marginTop={1}>
        <Text color={cursor === 0 ? 'cyan' : undefined}>{cursor === 0 ? '> ' : '  '}Yes</Text>
        <Text color={cursor === 1 ? 'cyan' : undefined}>{cursor === 1 ? '> ' : '  '}Leave as default</Text>
      </Box>
    </Box>
  );
};

const InstallationStep = (props: StepComponentProps) => {
  const { data, updateData, onNext, releases, setReleases, installProgress, setInstallProgress, installStatus, setInstallStatus } = props;
  const [phase, setPhase] = useState<'loading' | 'selecting' | 'installing' | 'done'>('loading');
  const [cursor, setCursor] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [installStarted, setInstallStarted] = useState(false);

  useEffect(() => {
    if (phase === 'loading') {
      fetch('https://api.github.com/repos/ThatRealDylan/blitcoder/releases', {
        headers: { 'User-Agent': 'BlitCoder-Setup' },
      })
        .then(r => r.json() as Promise<GitHubRelease[]>)
        .then((data) => {
          if (Array.isArray(data)) {
            setReleases(data);
            setPhase('selecting');
          } else {
            setError('No releases found');
            setPhase('selecting');
          }
        })
        .catch(e => {
          setError(`Failed: ${e.message}`);
          setPhase('selecting');
        });
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== 'installing' || installStarted) return;
    setInstallStarted(true);

    const runInstall = async () => {
      const sel = releases[data.selectedReleaseIndex];
      if (!sel) return;
      const destDir = path.join(data.installLocation, '.blitcoder');
      fs.ensureDirSync(destDir);
      setInstallStatus(`Downloading ${sel.tag_name}...`);

      try {
        const response = await fetch(sel.zipball_url);
        if (!response.body) throw new Error('No response body');
        const reader = response.body.getReader();
        const cl = parseInt(response.headers.get('content-length') || '0', 10);
        const chunks: Uint8Array[] = [];
        let received = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.length;
          if (cl > 0) setInstallProgress(Math.round((received / cl) * 100));
        }
        const zipPath = path.join(destDir, 'blitcoder.zip');
        fs.writeFileSync(zipPath, Buffer.concat(chunks));
        setInstallStatus('Extracting...');
        const extractDir = path.join(destDir, 'release');
        await extractZipArchive(zipPath, extractDir);
        fs.removeSync(zipPath);
        setInstallProgress(100);
        setInstallStatus(`${sel.tag_name} installed!`);
        setPhase('done');
      } catch (e: any) {
        setInstallStatus(`Failed: ${e.message}`);
        setError(e.message);
      }
    };
    runInstall();
  }, [phase, installStarted, data.selectedReleaseIndex, data.installLocation, releases, setInstallProgress, setInstallStatus]);

  const allReleases = [...releases.filter(r => !r.prerelease), ...releases.filter(r => r.prerelease)];

  useInput((_input, key) => {
    if (phase === 'selecting' && allReleases.length > 0) {
      if (key.upArrow) setCursor(Math.max(0, cursor - 1));
      if (key.downArrow) setCursor(Math.min(allReleases.length - 1, cursor + 1));
      if (key.return) {
        const sel = allReleases[cursor];
        if (sel && sel.prerelease) {
          updateData({ selectedReleaseIndex: cursor });
          setPhase('installing');
        } else if (sel) {
          updateData({ selectedReleaseIndex: cursor });
          setPhase('installing');
        }
      }
    }
    if (phase === 'done' && key.return) onNext();
  });

  if (phase === 'loading') {
    return (
      <Box flexDirection="column" paddingX={1} paddingTop={1}>
        <Text>Searching for latest updates...</Text>
      </Box>
    );
  }

  if (phase === 'selecting') {
    return (
      <Box flexDirection="column" paddingX={1} paddingTop={1}>
        <Text bold>Installation:</Text>
        {error && <Text color="red">{error}</Text>}
        {allReleases.map((r, i) => (
          <Text key={r.tag_name} color={cursor === i ? 'cyan' : undefined}>
            {cursor === i ? '> ' : '  '}{r.tag_name.replace(/^v/, '')} ({r.prerelease ? 'Nightly' : 'Stable'})
          </Text>
        ))}
      </Box>
    );
  }

  if (phase === 'installing') {
    return (
      <Box flexDirection="column" paddingX={1} paddingTop={1}>
        <Text bold>Installing...</Text>
        <ProgressBar pct={installProgress} />
        <Text>{installStatus}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1} paddingTop={1}>
      <Text color="green" bold>Installation Complete!</Text>
      <Text>{installStatus}</Text>
      <Text>Press Enter to continue...</Text>
    </Box>
  );
};

export const SetupWizard = ({ onComplete }: { onComplete: (data: SetupData) => void }) => {
  const [step, setStep] = useState<StepType>('welcome');
  const [data, setData] = useState<SetupData>({
    ollama: null, workspace: null, aiProvider: null, apiKey: '', defaultModel: 'None',
    truncation: 'skip', systemPrompt: null, selectedReleaseIndex: 0,
    installLocation: os.homedir(), customLocation: '',
  });
  const [releases, setReleases] = useState<GitHubRelease[]>([]);
  const [installProgress, setInstallProgress] = useState(0);
  const [installStatus, setInstallStatus] = useState('');
  const [terminalSize] = useState({ columns: process.stdout.columns, rows: process.stdout.rows });

  useEffect(() => {
    process.stdout.write('\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l');
    return () => { process.stdout.write('\x1b[?25h'); };
  }, []);

  useInput((input, key) => {
    const isKeyboard = key.upArrow || key.downArrow || key.leftArrow || key.rightArrow ||
      key.return || key.escape || key.backspace || key.tab || key.delete ||
      key.pageUp || key.pageDown || key.home || key.end ||
      key.ctrl || key.shift || key.meta ||
      (typeof input === 'string' && input.length > 0);
    if (!isKeyboard) return;
  });

  const updateData = useCallback((updates: Partial<SetupData>) => setData(prev => ({ ...prev, ...updates })), []);

  const goNext = useCallback(() => {
    const order: StepType[] = ['welcome', 'ollama', 'workspaces', 'ai-provider', 'extra-settings', 'installation'];
    const next = order[order.indexOf(step) + 1];
    if (next) setStep(next);
  }, [step]);

  const handleWelcomeChoice = useCallback((mode: 'now' | 'later') => {
    if (mode === 'later') {
      setData(prev => ({ ...prev, ollama: 'existing', workspace: 'sandboxed', aiProvider: 'skip', apiKey: '', defaultModel: 'None', truncation: 'skip', systemPrompt: null }));
    }
    setStep(mode === 'now' ? 'ollama' : 'installation');
  }, []);

  const handleComplete = useCallback(() => {
    try {
      fs.outputJsonSync(SETTINGS_PATH, {
        "System Prompt": data.systemPrompt || '',
        "AI Provider": data.aiProvider || 'skip',
        "API Key": data.apiKey || '',
        "Ollama": data.ollama === 'minimal' ? 'minimal' : 'existing',
        "Workspace Mode": data.workspace || 'sandboxed',
        "Default AI Model": data.defaultModel || 'None',
        "Dynamic Truncation": data.truncation === 'on+' ? 'ON+' : data.truncation === 'on' ? 'ON' : 'OFF',
      }, { spaces: 2 });
    } catch (e) {}
    onComplete(data);
  }, [data, onComplete]);

  const commonProps: StepComponentProps = {
    data, updateData, onNext: step === 'installation' ? handleComplete : goNext,
    releases, setReleases, installProgress, setInstallProgress, installStatus, setInstallStatus,
  };

  return (
    <Box flexDirection="column">
      {step !== 'welcome' && <StepIndicator current={step} />}
      {step === 'welcome' && <WelcomeStep onNext={handleWelcomeChoice} />}
      {step === 'ollama' && <OllamaStep {...commonProps} />}
      {step === 'workspaces' && <WorkspacesStep {...commonProps} />}
      {step === 'ai-provider' && <AIProviderStep {...commonProps} />}
      {step === 'extra-settings' && <ExtraSettingsStep {...commonProps} />}
      {step === 'installation' && <InstallationStep {...commonProps} />}
    </Box>
  );
};
