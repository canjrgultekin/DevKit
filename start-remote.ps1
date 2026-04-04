param(
    [string]$ApiKey = "",
    [int]$Port      = 3100,
    [switch]$NoBuild
)

$ErrorActionPreference = "Stop"
$ScriptRoot = $PSScriptRoot
$McpDir     = Join-Path $ScriptRoot "mcp-server"

Write-Host ""
Write-Host "  DevKit Remote MCP Launcher" -ForegroundColor Cyan
Write-Host "  iOS Claude | ngrok | API Key Auth" -ForegroundColor Cyan
Write-Host ""

if (-not $ApiKey) {
    if ($env:MCP_API_KEY) {
        $ApiKey = $env:MCP_API_KEY
        Write-Host "  [Auth] Env MCP_API_KEY kullaniliyor." -ForegroundColor Yellow
    } else {
        $buf = New-Object byte[] 24
        [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buf)
        $b64 = [Convert]::ToBase64String($buf)
        $ApiKey = $b64 -replace '\+','x' -replace '/','y' -replace '=',''
        Write-Host "  [Auth] Yeni API Key uretildi." -ForegroundColor Green
    }
}

Write-Host "  [Check] Onkosullar kontrol ediliyor..." -ForegroundColor Gray

try {
    $null = Invoke-WebRequest "http://localhost:5199" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
    Write-Host "  [OK]   DevKit backend calisiyor." -ForegroundColor Green
} catch {
    Write-Host "  [WARN] DevKit backend yanitlamiyor." -ForegroundColor Yellow
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "  [HATA] Node.js bulunamadi." -ForegroundColor Red
    exit 1
}
Write-Host "  [OK]   Node.js mevcut." -ForegroundColor Green

if (-not (Get-Command ngrok -ErrorAction SilentlyContinue)) {
    Write-Host "  [HATA] ngrok bulunamadi." -ForegroundColor Red
    Write-Host "         Kurmak icin: winget install ngrok.ngrok" -ForegroundColor White
    Write-Host "         Token: ngrok config add-authtoken SENIN_TOKENIN" -ForegroundColor White
    exit 1
}
Write-Host "  [OK]   ngrok mevcut." -ForegroundColor Green

$distIndex = Join-Path $McpDir "dist\index.js"
if (-not (Test-Path $distIndex)) {
    Write-Host "  [INFO] dist/index.js yok, build zorunlu." -ForegroundColor Yellow
    $NoBuild = $false
}

if (-not $NoBuild) {
    Write-Host "  [Build] MCP server derleniyor..." -ForegroundColor Gray
    Push-Location $McpDir
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  [HATA] Build basarisiz." -ForegroundColor Red
            exit 1
        }
        Write-Host "  [OK]   Build tamamlandi." -ForegroundColor Green
    } finally {
        Pop-Location
    }
}

$env:TRANSPORT   = "http"
$env:PORT        = [string]$Port
$env:MCP_API_KEY = $ApiKey
$env:DEVKIT_URL  = "http://localhost:5199"

Write-Host "  [MCP]  HTTP server baslatiliyor (port $Port)..." -ForegroundColor Gray

$mcpArgs = @{
    FilePath         = "node"
    ArgumentList     = (Join-Path $McpDir "dist\index.js")
    WorkingDirectory = $McpDir
    PassThru         = $true
    WindowStyle      = "Minimized"
}
$mcpProc = Start-Process @mcpArgs

Start-Sleep -Seconds 2

if ($mcpProc.HasExited) {
    Write-Host "  [HATA] MCP server hemen kapandi." -ForegroundColor Red
    exit 1
}
Write-Host "  [OK]   MCP server baslatildi (PID: $($mcpProc.Id))." -ForegroundColor Green

Write-Host "  [ngrok] Tunel aciliyor..." -ForegroundColor Gray

$ngrokArgs = @{
    FilePath     = "ngrok"
    ArgumentList = "http $Port"
    PassThru     = $true
    WindowStyle  = "Minimized"
}
$ngrokProc = Start-Process @ngrokArgs

$ngrokUrl = $null
for ($i = 1; $i -le 15; $i++) {
    Start-Sleep -Seconds 1
    try {
        $resp   = Invoke-RestMethod "http://localhost:4040/api/tunnels" -ErrorAction Stop
        $tunnel = $resp.tunnels | Where-Object { $_.proto -eq "https" } | Select-Object -First 1
        if ($tunnel) {
            $ngrokUrl = $tunnel.public_url
            break
        }
    } catch {}
}

Write-Host ""

if ($ngrokUrl) {
    $endpoint = "$ngrokUrl/mcp"
    Write-Host "  ================================================" -ForegroundColor Yellow
    Write-Host "  iOS Claude - Remote MCP Ayarlari"               -ForegroundColor Yellow
    Write-Host "  ================================================" -ForegroundColor Yellow
    Write-Host "  Sunucu URL   : $endpoint"                        -ForegroundColor White
    Write-Host "  Header Adi   : x-api-key"                        -ForegroundColor White
    Write-Host "  Header Deger : $ApiKey"                          -ForegroundColor White
    Write-Host "  ================================================" -ForegroundColor Yellow
    Write-Host ""
    Set-Clipboard -Value "$endpoint`r`nx-api-key: $ApiKey"
    Write-Host "  [OK]   URL ve Key panoya kopyalandi." -ForegroundColor Green
} else {
    Write-Host "  [WARN] ngrok URL alinamadi. Dashboard: http://localhost:4040" -ForegroundColor Yellow
    Write-Host "         Yerel: http://localhost:$Port/mcp"                     -ForegroundColor White
    Write-Host "         API Key: $ApiKey"                                      -ForegroundColor White
}

Write-Host ""
Write-Host "  Durdurmak icin Ctrl+C..." -ForegroundColor Gray
Write-Host ""

try {
    while (-not $mcpProc.HasExited) {
        Start-Sleep -Seconds 5
        if ($ngrokProc.HasExited) {
            Write-Host "  [WARN] ngrok kapandi." -ForegroundColor Yellow
        }
    }
    Write-Host "  [WARN] MCP server kapandi." -ForegroundColor Yellow
} finally {
    Write-Host "  Temizleniyor..." -ForegroundColor Gray
    try { if (-not $mcpProc.HasExited)   { $mcpProc.Kill()   } } catch {}
    try { if (-not $ngrokProc.HasExited) { $ngrokProc.Kill() } } catch {}
    Write-Host "  Tum prosesler durduruldu." -ForegroundColor Gray
}