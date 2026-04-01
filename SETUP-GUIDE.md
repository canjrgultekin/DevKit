# DevKit Kurulum Kılavuzu

Bu kılavuz DevKit'i sıfırdan kurup Claude Desktop ile birlikte kullanmaya başlamanızı sağlar.

---

## Gereksinimler

Başlamadan önce bilgisayarınızda şunların kurulu olması gerekir:

- **.NET 9 SDK** → https://dotnet.microsoft.com/download/dotnet/9.0
- **Node.js 18+** → https://nodejs.org
- **Git** → https://git-scm.com
- **Claude Desktop** → https://claude.ai/download

Opsiyonel (kullanacağınız modüllere göre):

- **Docker Desktop** → Docker Compose modülü için
- **Azure CLI (`az`)** → Azure deploy modülü için (`winget install Microsoft.AzureCLI`)
- **GitHub CLI (`gh`)** → GitHub repo oluşturma için (`winget install GitHub.cli`)

---

## Adım 1: Repoyu Klonla

```bash
git clone https://github.com/canjrgultekin/DevKit.git
cd DevKit
```

---

## Adım 2: Frontend Build

```bash
cd src/DevKit/ClientApp
npm install
npm run build
cd ../../..
```

---

## Adım 3: Backend Çalıştır

```bash
cd src/DevKit
dotnet run
```

Terminalde şunu görmelisiniz:

```
Now listening on: http://localhost:5199
```

Tarayıcıda `http://localhost:5199` adresini açın. DevKit arayüzü geliyorsa backend çalışıyor demektir.

**Not:** Backend her zaman çalışıyor olmalıdır. Yeni terminal penceresi açıp diğer adımlara devam edin.

---

## Adım 4: MCP Server Kur (Claude Desktop Entegrasyonu)

İki yöntem var. İstediğinizi seçin:

### Yöntem A: npm ile (Önerilen)

```bash
npm install -g devkit-mcp-server
devkit-mcp-server --setup
```

İlk komut MCP server'ı global olarak kurar. İkinci komut Claude Desktop config dosyasını otomatik bulur ve DevKit bağlantısını ekler. Windows normal kurulum, Microsoft Store kurulumu ve Mac desteği dahildir.

### Yöntem B: Repodan Build

```bash
cd mcp-server
npm install
npm run build
cd ..
```

Sonra Claude Desktop config dosyasını manuel düzenleyin:

**Windows (normal):** `%APPDATA%\Claude\claude_desktop_config.json`
**Windows (Microsoft Store):** `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json`
**Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`

Dosyanın içine ekleyin (mevcut ayarları koruyun):

```json
{
  "mcpServers": {
    "devkit": {
      "command": "node",
      "args": ["TAM_YOL/DevKit/mcp-server/dist/index.js"],
      "env": {
        "DEVKIT_URL": "http://localhost:5199"
      }
    }
  }
}
```

`TAM_YOL` kısmını DevKit'i klonladığınız dizinle değiştirin.

---

## Adım 5: Claude Desktop'ı Yeniden Başlat

Claude Desktop'ı tamamen kapatıp tekrar açın. MCP bağlantısı yeniden başlatma sonrası aktif olur.

---

## Adım 6: Test Et

Claude Desktop'ta yeni bir conversation açın ve şunu yazın:

```
DevKit profillerini listele
```

DevKit'ten yanıt geliyorsa kurulum tamamdır.

---

## İlk Projenizi Başlatın

### 1. Kuralları Yükle

```
DevKit kurallarını yükle ve .NET projesi için hazırlan
```

### 2. Profil Oluştur

```
DevKit'te "my-backend" adında yeni profil oluştur. İsmi "My Backend", 
workspace "C:\source\myproject", framework dotnet. Profili aktif yap.
```

Workspace path'ini kendi bilgisayarınızdaki dizine göre değiştirin.

### 3. Proje Scaffold Et

Claude'a proje yapınızı anlattıktan sonra manifest JSON'ı oluşturmasını ve DevKit scaffold ile diske yazmasını isteyin:

```
Bana Clean Architecture .NET 9 projesi tasarla. Solution adı "MyProject", 
output path "C:\source\myproject". Domain, Application, Infrastructure ve Api 
projeleri olsun. DevKit scaffold ile create modunda oluştur.
```

### 4. GitHub Repo Oluştur

```
GitHub'da "my-project" adında private repo oluştur, commitle ve push et. 
Sonra "dev" branch'i oluştur ve ona geç.
```

Not: İlk kullanımda terminalde `gh auth login` çalıştırmanız gerekir.

### 5. Kodlama

Claude'a kodlamasını istediğiniz dosyaları anlattığınızda şunu ekleyin:

```
Kodladığın dosyaları download olarak verme, DevKit import ile doğrudan 
"C:\source\myproject" projesine yerleştir.
```

Claude her dosyayı DEVKIT_PATH marker'ı ile kodlar ve `devkit_import_file` tool'unu çağırarak projenize otomatik yerleştirir.

### 6. Commit ve Push

```
Tüm değişiklikleri "feat: initial project setup" mesajıyla commitle ve push et
```

### 7. Docker Altyapı (Opsiyonel)

```
Docker compose oluştur: postgresql, kafka, elasticsearch, jaeger. 
Proje adı "myproject". C:\source\myproject dizinine kaydet. 
Connection string'leri src/MyProject.Api/appsettings.json'a inject et. 
Docker'ı başlat.
```

### 8. Azure Deploy (Opsiyonel)

Önce profil Azure bilgilerini güncelleyin:

```
Profili güncelle: subscription ID "xxx", resource group "rg-myproject", 
resource "app-myproject-api" project path "src/MyProject.Api" deploy mode appservice. 
Azure'a login ol ve deploy et.
```

---

## DevKit UI Kullanımı

MCP yerine tarayıcı arayüzünü de kullanabilirsiniz. `http://localhost:5199` adresinde 8 sayfa var:

| Sayfa | Ne Yapar |
|-------|----------|
| **Dashboard** | Hızlı erişim ve aktif profil |
| **Scaffold** | JSON manifest'ten proje oluşturma |
| **File Import** | Sürükle-bırak ile dosya yerleştirme |
| **Git** | Commit, push, branch, merge, stash, tag |
| **Docker** | Compose oluşturma, servis yönetimi |
| **Crypto** | Encrypt/decrypt, key rotation |
| **Azure** | Deploy, restart, env vars, logs |
| **Profiles** | Proje profilleri ve Azure config |

---

## Sorun Giderme

### DevKit backend başlamıyor

```
dotnet --version
```

.NET 9 kurulu olduğundan emin olun.

### MCP bağlantısı çalışmıyor

1. DevKit backend'in çalıştığından emin olun (`http://localhost:5199` açılmalı)
2. Claude Desktop'ı tamamen kapatıp açın
3. `devkit-mcp-server --setup` tekrar çalıştırın

### Port 5199 kullanımda

Önceki DevKit instance'ı kapanmamış:

```bash
# Windows
taskkill /f /im dotnet.exe

# Mac/Linux
pkill -f "dotnet run"
```

### Claude Desktop çok yer kaplıyor

```bash
devkit-mcp-server --cleanup
```

Bu komut vm_bundles ve cache klasörlerini temizler.

### GitHub push engelleniyorsa

Dosyalarınızda secret (API key, token vb.) olabilir. `.gitignore`'a ekleyin:

```
appsettings.Local.json
*.env
```

### Azure deploy 403 hatası

SCM IP kısıtlamaları olabilir. Azure Portal'dan App Service → Networking → SCM IP restrictions'a geliştirici IP'nizi ekleyin.

---

## Komut Referansı

Claude Desktop'ta kullanabileceğiniz temel komutlar:

```
DevKit kurallarını yükle                              → Prompt kurallarını yükler
DevKit profillerini listele                           → Profilleri gösterir
Profili aktif yap: my-backend                         → Profil değiştirir
Git durumunu göster                                   → Git status
Commitle: "mesaj"                                     → Stage all + commit
Push yap                                              → Git push
"dev" branch'i oluştur                                → Yeni branch
Docker compose oluştur: postgresql, kafka             → YAML oluşturur
Docker'ı başlat                                       → docker compose up
Azure'a deploy et: app-name                           → Build + deploy
Bu dosyayı projeye import et: [dosya]                 → DEVKIT_PATH ile yerleştirir
```

Tüm 47 tool'un listesi için README.md dosyasına bakın.
