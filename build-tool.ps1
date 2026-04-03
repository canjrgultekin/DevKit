# DevKit - NuGet Global Tool Build & Publish
# Kullanim:
#   .\build-tool.ps1              → Local test (build + install)
#   .\build-tool.ps1 -Publish     → NuGet'e yayinla
#   .\build-tool.ps1 -Uninstall   → Kaldır

param(
    [switch]$Publish,
    [switch]$Uninstall,
    [string]$NuGetKey
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectPath = Join-Path $root "src\DevKit"
$clientAppPath = Join-Path $projectPath "ClientApp"
$wwwrootPath = Join-Path $projectPath "wwwroot"

Write-Host "`nDevKit Global Tool Builder" -ForegroundColor Cyan
Write-Host "=========================`n" -ForegroundColor Cyan

if ($Uninstall) {
    dotnet tool uninstall -g DevKit
    Write-Host "Kaldirildi." -ForegroundColor Green
    exit 0
}

# 1. Frontend build
Write-Host "[1/3] Frontend build..." -ForegroundColor Yellow
Push-Location $clientAppPath
if (-not (Test-Path "node_modules")) { npm install --silent }
npm run build
Pop-Location

# Vite output wwwroot'a kopyala (vite.config.ts outDir: '../wwwroot' degilse)
$distPath = Join-Path $clientAppPath "dist"
if ((Test-Path $distPath) -and -not (Test-Path (Join-Path $wwwrootPath "assets"))) {
    Write-Host "  dist → wwwroot kopyalaniyor..." -ForegroundColor Gray
    if (-not (Test-Path $wwwrootPath)) { New-Item -ItemType Directory -Path $wwwrootPath -Force | Out-Null }
    Copy-Item "$distPath\*" $wwwrootPath -Recurse -Force
}
Write-Host "  OK" -ForegroundColor Green

# 2. Pack
Write-Host "[2/3] dotnet pack..." -ForegroundColor Yellow
Push-Location $projectPath
$nupkgDir = Join-Path $projectPath "nupkg"
if (Test-Path $nupkgDir) { Remove-Item "$nupkgDir\*" -Force }
dotnet pack -c Release -o $nupkgDir
Pop-Location

$pkg = Get-ChildItem "$nupkgDir\*.nupkg" | Select-Object -First 1
Write-Host "  $($pkg.Name)" -ForegroundColor Green

# 3. Install or Publish
if ($Publish) {
    Write-Host "[3/3] NuGet publish..." -ForegroundColor Yellow
    if (-not $NuGetKey) { $NuGetKey = Read-Host "NuGet API Key" }
    dotnet nuget push $pkg.FullName --api-key $NuGetKey --source https://api.nuget.org/v3/index.json
    Write-Host "  Yayinlandi! Kullanicilar: dotnet tool install -g DevKit" -ForegroundColor Green
} else {
    Write-Host "[3/3] Local install..." -ForegroundColor Yellow
    try { dotnet tool uninstall -g DevKit 2>$null } catch { }
    dotnet tool install -g --add-source $nupkgDir DevKit
    Write-Host "  Kuruldu! 'devkit' komutuyla baslatin." -ForegroundColor Green
}

Write-Host "`nTamamlandi!`n" -ForegroundColor Cyan
