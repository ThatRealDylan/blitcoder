param([switch]$Bootstrap)

$ASCII_LINES = @(
  "██████╗ ██╗     ██╗████████╗ ██████╗ ██████╗ ██████╗ ███████╗██████╗ ",
  "██╔══██╗██║     ██║╚══██╔══╝██╔════╝██╔═══██╗██╔══██╗██╔════╝██╔══██╗",
  "██████╔╝██║     ██║   ██║   ██║     ██║   ██║██║  ██║█████╗  ██████╔╝",
  "██╔══██╗██║     ██║   ██║   ██║     ██║   ██║██║  ██║██╔══╝  ██╔══██╗",
  "██████╔╝███████╗██║   ██║   ╚██████╗╚██████╔╝██████╔╝███████╗██║  ██║",
  "╚═════╝ ╚══════╝╚═╝   ╚═╝    ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝"
)

function Show-Welcome {
  $sel = 0
  $options = @("Setup Now - Start the setup.", "Setup Later - Skip to the installation.")
  do {
    Clear-Host
    foreach ($line in $ASCII_LINES[0..2]) { Write-Host $line -ForegroundColor Green }
    foreach ($line in $ASCII_LINES[3..5]) { Write-Host $line -ForegroundColor Blue }
    Write-Host
    Write-Host "Welcome to the BlitCoder Setup! How would you like to proceed?"
    Write-Host
    for ($i = 0; $i -lt $options.Length; $i++) {
      if ($i -eq $sel) { Write-Host ">" $options[$i] -ForegroundColor Cyan }
      else { Write-Host " " $options[$i] }
    }
    $key = [Console]::ReadKey($true)
    if ($key.Key -eq 'UpArrow' -and $sel -gt 0) { $sel-- }
    if ($key.Key -eq 'DownArrow' -and $sel -lt $options.Length - 1) { $sel++ }
  } while ($key.Key -ne 'Enter')
  return $sel -eq 0
}

function Read-Option {
  param([string[]]$Options, [int]$Default = 0)
  $sel = $Default
  $width = ($Options | ForEach-Object { $_.Length } | Measure-Object -Maximum).Maximum + 2
  do {
    for ($i = 0; $i -lt $Options.Length; $i++) {
      $line = if ($i -eq $sel) { ">" + $Options[$i] } else { " " + $Options[$i] }
      Write-Host $line.PadRight($width)
    }
    $key = [Console]::ReadKey($true)
    if ($key.Key -eq 'UpArrow' -and $sel -gt 0) { $sel-- }
    if ($key.Key -eq 'DownArrow' -and $sel -lt $Options.Length - 1) { $sel++ }
    [Console]::CursorTop -= $Options.Length
  } while ($key.Key -ne 'Enter')
  return $sel
}

$BASE_URL = "https://blitinstall.testingblobs1.workers.dev"

try {
  $setupNow = Show-Welcome

  $ollamaMode = 'existing'
  $aiProvider = 'skip'
  $apiKey = ''
  $defaultModel = 'None'
  $systemPrompt = $null
  $truncation = 'OFF'

  if ($setupNow) {
    Clear-Host
    Write-Host "Ollama" -ForegroundColor Cyan
    Write-Host "──────────────────────────────────────"
    Write-Host
    Write-Host "Ollama Instance:"
    Write-Host
    $ollSel = Read-Option -Options @("System Ollama - Already installed on your PC", "Minimal Ollama - Bundled portable version")
    $ollamaMode = @('system', 'minimal')[$ollSel]

    Clear-Host
    Write-Host "Ollama > " -NoNewline -ForegroundColor Green
    Write-Host "AI Provider" -ForegroundColor Cyan
    Write-Host "──────────────────────────────────────"
    Write-Host
    Write-Host "AI Provider:"
    Write-Host
    $provSel = Read-Option -Options @("OpenAI", "Gemini", "DeepSeek", "Qwen", "Ollama (Local)", "Skip This Step")
    $aiProviders = @('openai', 'gemini', 'deepseek', 'qwen', 'ollama', 'skip')
    $aiProvider = $aiProviders[$provSel]

    if ($provSel -lt 5) {
      Clear-Host
      Write-Host "Ollama > AI Provider > " -NoNewline -ForegroundColor Green
      Write-Host "System Prompt" -ForegroundColor Cyan
      Write-Host "──────────────────────────────────────"
      Write-Host
      Write-Host "System Prompt:"
      Write-Host "Current default: 'You are a helpful coding assistant.'"
      Write-Host "Enter a custom system prompt (or press Enter to keep default):"
      Write-Host -NoNewline "> "
      $sp = Read-Host
      if (-not [string]::IsNullOrWhiteSpace($sp)) { $systemPrompt = $sp }
    }

    Clear-Host
    Write-Host "Ollama > AI Provider > System Prompt > " -NoNewline -ForegroundColor Green
    Write-Host "Extra Settings" -ForegroundColor Cyan
    Write-Host "──────────────────────────────────────"
    Write-Host
    if ($provSel -lt 5) {
      Write-Host "API Key:"
      Write-Host -NoNewline "> "
      $key = Read-Host
      if (-not [string]::IsNullOrWhiteSpace($key)) { $apiKey = $key }
    }
    if ($aiProvider -eq 'ollama') {
      Write-Host
      Write-Host "Default AI Model (e.g. llama3.2, deepseek-r1:1.5b):"
      Write-Host -NoNewline "> "
      $m = Read-Host
      $defaultModel = if ([string]::IsNullOrWhiteSpace($m)) { 'None' } else { $m }
    }
    Write-Host
    Write-Host "Truncation (OFF = full context, ON = truncate):"
    Write-Host -NoNewline "> "
    $t = Read-Host
    if ($t -eq 'ON' -or $t -eq 'on') { $truncation = 'ON' }
  }

  $locSel = 0
  do {
    Clear-Host
    Write-Host "Ollama > AI Provider > System Prompt > Extra Settings > " -NoNewline -ForegroundColor Green
    Write-Host "Installation" -ForegroundColor Cyan
    Write-Host "──────────────────────────────────────"
    Write-Host
    Write-Host "Install Location:" -ForegroundColor Yellow
    Write-Host
    $opts = @("User Folder ($env:USERPROFILE\blitcoder)", "Custom...")
    for ($i = 0; $i -lt $opts.Length; $i++) {
      if ($i -eq $locSel) { Write-Host ">" $opts[$i] -ForegroundColor Cyan }
      else { Write-Host " " $opts[$i] }
    }
    $key = [Console]::ReadKey($true)
    if ($key.Key -eq 'UpArrow' -and $locSel -gt 0) { $locSel-- }
    if ($key.Key -eq 'DownArrow' -and $locSel -lt $opts.Length - 1) { $locSel++ }
  } while ($key.Key -ne 'Enter')
  $installDir = Join-Path $env:USERPROFILE "blitcoder"
  if ($locSel -eq 1) {
    Clear-Host
    Write-Host "Ollama > AI Provider > System Prompt > Extra Settings > Installation > " -NoNewline -ForegroundColor Green
    Write-Host "Custom Path" -ForegroundColor Cyan
    Write-Host "──────────────────────────────────────"
    Write-Host
    Write-Host -NoNewline "Enter full path: "
    $p = Read-Host
    if (-not [string]::IsNullOrWhiteSpace($p)) { $installDir = $p }
  }

  Clear-Host
  Write-Host "Ollama > AI Provider > System Prompt > Extra Settings > Installation" -ForegroundColor Cyan
  Write-Host "──────────────────────────────────────"
  Write-Host
  Write-Host "Downloading BlitCoder..."
  Write-Host

  $zipUrl = "https://www.dropbox.com/scl/fi/x8yrh4h965cij07k2m506/blitcoder-v1.0.0.zip?rlkey=lsqz8cu5fmvs7my1pni0f0hwm&st=t2kmbijk&dl=1"
  $tempZip = Join-Path $env:TEMP "blitcoder.zip"
  $tempDir = Join-Path $env:TEMP "blitcoder-install"

  try {
    Invoke-WebRequest -Uri $zipUrl -OutFile $tempZip -ErrorAction Stop
  } catch {
    Write-Host "Download failed: $($_.Exception.Message)" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
  }

  Write-Host "Installing to: $installDir" -ForegroundColor Yellow

  if (Test-Path $tempDir) { Remove-Item -Path $tempDir -Recurse -Force }
  New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
  Expand-Archive -Path $tempZip -DestinationPath $tempDir -Force
  Remove-Item $tempZip -Force

  if (Test-Path $installDir) { Remove-Item -Path $installDir -Recurse -Force }
  New-Item -ItemType Directory -Path $installDir -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $installDir ".blitcoder") -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $installDir "workspaces") -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $installDir "app") -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $installDir ".blitcoder" "bin") -Force | Out-Null

  Move-Item (Join-Path $tempDir "blitcoder.exe") (Join-Path $installDir "blitcoder.exe") -Force
  Move-Item (Join-Path $tempDir "ascii.txt") (Join-Path $installDir "app" "ascii.txt") -Force
  Move-Item (Join-Path $tempDir "system_prompt.txt") (Join-Path $installDir ".blitcoder" "system_prompt.txt") -Force
  Move-Item (Join-Path $tempDir "settings.json") (Join-Path $installDir ".blitcoder" "settings.json") -Force
  Move-Item (Join-Path $tempDir "memory.json") (Join-Path $installDir ".blitcoder" "memory.json") -Force

  if (Test-Path (Join-Path $tempDir "gui")) {
    New-Item -ItemType Directory -Path (Join-Path $installDir "gui" "dist") -Force | Out-Null
    Copy-Item -Path (Join-Path $tempDir "gui\*") -Destination (Join-Path $installDir "gui" "dist") -Recurse -Force
    Remove-Item -Path (Join-Path $tempDir "gui") -Recurse -Force
  }

  Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue

  $target = "User"
  try {
    $curPath = [Environment]::GetEnvironmentVariable("PATH", $target)
    if ($curPath -notlike "*$installDir*") {
      [Environment]::SetEnvironmentVariable("PATH", "$curPath;$installDir", $target)
      $env:PATH = "$env:PATH;$installDir"
    }
  } catch {
    Write-Host "Could not update PATH automatically." -ForegroundColor DarkYellow
  }

  Write-Host
  Write-Host "Installation complete!" -ForegroundColor Green
  Write-Host "BlitCoder installed at: $installDir" -ForegroundColor Cyan
  Write-Host "Install dir added to PATH (open a new terminal)." -ForegroundColor Yellow
  Write-Host
  Write-Host "Run: blitcoder" -ForegroundColor Yellow
  Read-Host "Press Enter to exit"

} catch {
  Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
  Read-Host "Press Enter to exit"
  exit 1
}
