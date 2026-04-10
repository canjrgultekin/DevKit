# DevKit-Tool

[![NuGet](https://img.shields.io/nuget/v/DevKit-Tool.svg)](https://www.nuget.org/packages/DevKit-Tool)
[![Downloads](https://img.shields.io/nuget/dt/DevKit-Tool.svg)](https://www.nuget.org/packages/DevKit-Tool)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Developer Toolkit & AI Companion** — .NET, Next.js, Node.js ve Python projeleri için local-first geliştirme otomasyonu, native Claude Desktop MCP entegrasyonlu.

DevKit, geliştiricinin gün içinde kullandığı operasyonel adımları (proje iskeleti, mimari tasarım, Git, Docker, Azure deploy, veritabanı, mesajlaşma, observability, kod üretimi, dosya yönetimi) tek bir local API + UI altında toplar ve aynı yetenekleri Claude Desktop'a MCP üzerinden açar. Bir kez kurarsın, hem tarayıcı tabanlı UI'dan hem de Claude Desktop'tan doğal dilde kullanırsın.

## Tek Komutla Kurulum

```bash
dotnet tool install -g DevKit-Tool
devkit
```

Sadece bu kadar. `devkit` ilk çalıştığında `devkit-mcp-server` paketini otomatik olarak npm üzerinden global kurar, Claude Desktop config'ini günceller ve mevcut MCP connector'larını ezmeden yapılandırmayı tamamlar. Sonraki çalıştırmalarda MCP server güncel sürüme çekilir, Claude Desktop config sessizce senkronlanır.

Güncellemek için:

```bash
dotnet tool update -g DevKit-Tool
```

Kaldırmak için:

```bash
dotnet tool uninstall -g DevKit-Tool
```

## Çalıştırma Modları

```bash
devkit              # API + UI başlat, tarayıcıyı aç
devkit --no-browser # Tarayıcı açmadan başlat
devkit --install    # MCP server kurulumunu tekrar tetikle
```

| Bileşen | Adres | Açıklama |
|---|---|---|
| DevKit API + UI | http://localhost:5199 | REST API ve statik web arayüzü |
| DevKit MCP Server | stdio | Claude Desktop MCP bağlantısı |

## 2.0.4 Sürümünde Yenilikler

Bu sürüm, kurulum ve günlük kullanım deneyimini sıfırlıyor. Eski sürümlerde kullanıcı `npm install -g devkit-mcp-server` ve ardından `devkit-mcp-server --setup` komutlarını manuel çalıştırıyordu. 2.0.4 ile birlikte bu adımların tamamı `devkit` ilk açılışında otomatik tetikleniyor. `~/.devkit-mcp-installed` marker dosyası ile kurulum durumu izleniyor, gereksiz tekrar kurulumların önüne geçiliyor, fakat her açılışta MCP server güncel sürüme çekilip Claude Desktop config sessizce senkronlanıyor.

UI tarafında Architecture Designer modülü tam genişletildi: sürükle bırak component yerleştirme, .NET, Next.js, Node.js ve Python projeleri için manifest üretimi, Docker Compose çıktısı oluşturma, Jaeger ile OpenTelemetry Collector arasındaki port çakışmalarının otomatik çözülmesi, karma mimari (dotnet + nextjs gibi) projelerinin tek tasarımdan birden fazla framework için scaffold edilmesi geldi.

MCP server tarafında 160'tan fazla tool aktif: kod üretimi, Git, Docker, Azure, PostgreSQL, MSSQL, Couchbase, Redis, Kafka, RabbitMQ, build/test/publish, çok adımlı shell pipeline'ları, Jarwis kalıcı bellek sistemi, Playwright, Windows-MCP ve Excel-MCP connector orkestrasyonu gibi alanları kapsıyor.

## Modüller

- **Architecture Designer** — Görsel mimari tasarım, manifest üretimi, smart-default port yönetimi, Docker Compose çıktısı.
- **Project Scaffolding** — .NET, Next.js, Node.js, Python iskeletlerini JSON manifest'ten üretme, hibrit projelerde framework başına ayrı scaffold.
- **Project Scanner** — Mevcut projenin teknoloji, dependency, namespace ve dosya yapısını çıkarma, Claude'a context aktarma.
- **AI File Import** — `DEVKIT_PATH` marker'ı ile Claude'un ürettiği dosyaları doğru klasörlere yerleştirme.
- **Code Generator** — Entity, repository, service, controller, DTO ve full CRUD setlerini doğrudan projeye yazma.
- **Git Management** — Branch, commit, push, pull, merge, stash, tag, GitHub repo oluşturma, init + connect akışı.
- **Docker Compose** — Kafka, RabbitMQ, PostgreSQL, MSSQL, Redis, Elasticsearch, Kibana, Logstash, Jaeger, Zipkin, Grafana, OTel Collector template'leri, appsettings.json otomatik enjeksiyon.
- **Database Toolkit** — PostgreSQL, MSSQL, Couchbase için query, execute, batch ve describe işlemleri, EF Core migration komutları.
- **DB Schema Visualizer** — Şema, tablo, index ve foreign key tarama, CREATE script üretme.
- **Migration Manager** — SQL migration versiyonlama, uygulama, rollback ve durum izleme.
- **Redis Toolkit** — Key/value, hash, list, set, TTL ve admin işlemleri.
- **Kafka Toolkit** — Topic CRUD, produce/consume, batch publish, consumer group yönetimi.
- **API Test Runner** — Swagger/OpenAPI parse, HTTP request gönderme, response inceleme.
- **Package Auditor** — NuGet, npm ve pip dependency tarama, outdated ve güvenlik kontrolü.
- **Env Comparator** — appsettings ortamlarını karşılaştırma.
- **Log Viewer** — Yapılandırılmış log dosyası okuma, level / correlation ID / metin filtreleme.
- **Crypto & Credentials** — AES-256-GCM şifreleme/çözme, key rotation, tablo bazlı toplu rekey.
- **Azure Management** — App Service deploy, environment variables, restart, log görüntüleme, login akışı.
- **Process Manager** — Arka plan process başlatma, stdin gönderme, çıktı izleme.
- **Shell Pipeline** — Çok adımlı build, publish ve deploy script'leri.
- **Jarwis AI Companion** — Kalıcı bellek, browser context cache, proje ve PC bilgileri, session logging.

## MCP Komut Örnekleri

Claude Desktop üzerinden doğal dilde:

```
"DevKit kurallarını yükle ve .NET projesi için hazırlan"
"Projeyi tara"
"Clean architecture tasarımı oluştur, adı ECommerce, PostgreSQL ve Kafka ekle"
"Manifest oluştur ve scaffold et"
"Docker compose oluştur, başlat ve appsettings'e connection string'leri yaz"
"Customer entity'si için full CRUD setini üret ve projeye yaz"
"EF migration ekle: AddCustomerEmail"
"Tüm değişiklikleri commitle ve push yap"
"Azure App Service'e deploy et"
```

## Gereksinimler

- .NET 9 SDK
- Node.js 18+ (MCP server için, ilk çalıştırmada otomatik kullanılır)
- Claude Desktop (MCP entegrasyonu için)

## Opsiyonel Gereksinimler

- Docker Desktop (Docker Compose modülü için)
- Azure CLI (Azure deploy modülü için)
- GitHub CLI (GitHub repo oluşturma için)
- PostgreSQL, MSSQL veya Couchbase (DB modülleri için)

## Linkler

- GitHub: https://github.com/canjrgultekin/DevKit
- MCP Server (npm): https://www.npmjs.com/package/devkit-mcp-server
- Issues: https://github.com/canjrgultekin/DevKit/issues

## Lisans

MIT © Can Gultekin
