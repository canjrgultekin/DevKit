#!/bin/bash
# DevKit - NuGet Global Tool Build & Publish (Mac/Linux)
# Kullanim:
#   ./build-tool.sh              → Local test (build + install)
#   ./build-tool.sh --publish    → NuGet'e yayinla
#   ./build-tool.sh --uninstall  → Kaldir

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
PROJECT_PATH="$ROOT/src/DevKit"
CLIENT_PATH="$PROJECT_PATH/ClientApp"
NUPKG_PATH="$PROJECT_PATH/nupkg"

echo ""
echo "DevKit Global Tool Builder"
echo "========================="
echo ""

if [ "$1" = "--uninstall" ]; then
    dotnet tool uninstall -g DevKit || true
    echo "Kaldirildi."
    exit 0
fi

# 1. Frontend build
echo "[1/3] Frontend build..."
cd "$CLIENT_PATH"
[ ! -d "node_modules" ] && npm install --silent
npm run build
cd "$ROOT"

# Vite output wwwroot'a kopyala (gerekirse)
if [ -d "$CLIENT_PATH/dist" ] && [ ! -d "$PROJECT_PATH/wwwroot/assets" ]; then
    echo "  dist → wwwroot kopyalaniyor..."
    mkdir -p "$PROJECT_PATH/wwwroot"
    cp -r "$CLIENT_PATH/dist/"* "$PROJECT_PATH/wwwroot/"
fi
echo "  OK"

# 2. Pack
echo "[2/3] dotnet pack..."
cd "$PROJECT_PATH"
rm -rf "$NUPKG_PATH"
dotnet pack -c Release -o "$NUPKG_PATH"
cd "$ROOT"

PKG=$(ls "$NUPKG_PATH"/*.nupkg 2>/dev/null | head -1)
echo "  $(basename "$PKG")"

# 3. Install or Publish
if [ "$1" = "--publish" ]; then
    echo "[3/3] NuGet publish..."
    if [ -z "$2" ]; then
        read -p "NuGet API Key: " NUGET_KEY
    else
        NUGET_KEY="$2"
    fi
    dotnet nuget push "$PKG" --api-key "$NUGET_KEY" --source https://api.nuget.org/v3/index.json
    echo "  Yayinlandi! Kullanicilar: dotnet tool install -g DevKit"
else
    echo "[3/3] Local install..."
    dotnet tool uninstall -g DevKit 2>/dev/null || true
    dotnet tool install -g --add-source "$NUPKG_PATH" DevKit
    echo "  Kuruldu! 'devkit' komutuyla baslatin."
fi

echo ""
echo "Tamamlandi!"
echo ""
