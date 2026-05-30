param(
  [string]$Version
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $PSScriptRoot
$DistDir = Join-Path $RootDir "dist"
$ReleaseDir = Join-Path $DistDir "release"

if (-not $Version) {
  $pkg = Get-Content (Join-Path $RootDir "package.json") | ConvertFrom-Json
  $Version = $pkg.version
}

Write-Host "Building BlitCoder v$Version" -ForegroundColor Cyan

# Clean
if (Test-Path $DistDir) { Remove-Item -Path $DistDir -Recurse -Force }
New-Item -ItemType Directory -Path $ReleaseDir -Force | Out-Null

# 1. Build GUI
Write-Host "[1/4] Building GUI..." -ForegroundColor Yellow
Push-Location (Join-Path $RootDir "gui")
try {
  $env:VITE_API_URL = ""
  bun run build
} finally { Pop-Location }

# 2. Compile binary
Write-Host "[2/4] Compiling BlitCoder binary..." -ForegroundColor Yellow
bun build --compile --target=bun-windows-x64 --outfile (Join-Path $ReleaseDir "blitcoder") (Join-Path $RootDir "index.ts")

# 3. Create default config files
Write-Host "[3/4] Creating default config files..." -ForegroundColor Yellow

# system_prompt.txt
@"
You are BlitCoder, an advanced AI coding assistant powered by cloud and local LLMs.
Your goal is to help the user with their coding tasks by writing high-quality code, debugging, and explaining complex concepts.
You have the ability to read, create, modify, and delete files in the user's workspace.
Always be concise, professional, and helpful.
When modifying files, specify the changes clearly.
If you are performing a potentially dangerous action (like deleting a directory or running a system command), you MUST ask for confirmation first.
"@ | Out-File (Join-Path $ReleaseDir "system_prompt.txt") -Encoding utf8 -Force

# memory.json
"{}" | Out-File (Join-Path $ReleaseDir "memory.json") -Encoding utf8 -Force

# settings.json
$settings = @{
  'System Prompt' = ''
  'AI Provider' = 'skip'
  'API Key' = ''
  'Ollama' = 'existing'
  'Default AI Model' = 'None'
  'Dynamic Truncation' = 'OFF'
}
$settings | ConvertTo-Json -Depth 5 | Out-File (Join-Path $ReleaseDir "settings.json") -Encoding utf8 -Force

Copy-Item (Join-Path $RootDir "app\ascii.txt") (Join-Path $ReleaseDir "ascii.txt") -Force

# GUI dist
$guiDistDest = Join-Path (Join-Path $ReleaseDir "gui") "dist"
New-Item -ItemType Directory -Path $guiDistDest -Force | Out-Null
Copy-Item -Path (Join-Path (Join-Path $RootDir "gui") "dist\*") -Destination $guiDistDest -Recurse -Force

# 4. Create ZIP
Write-Host "[4/4] Creating release zip..." -ForegroundColor Yellow
$zipName = "blitcoder-v$Version.zip"
$zipPath = Join-Path $RootDir $zipName
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path "$ReleaseDir\*" -DestinationPath $zipPath

# 5. Copy to Cloudflare
$cfDir = "D:\BlitAI\blitcodercloudflare\static\releases"
if (Test-Path $cfDir) {
  Copy-Item -Path $zipPath -Destination (Join-Path $cfDir $zipName) -Force
  Write-Host "Copied $zipName to Cloudflare releases" -ForegroundColor Green
}

Write-Host "Done: $zipPath" -ForegroundColor Green
