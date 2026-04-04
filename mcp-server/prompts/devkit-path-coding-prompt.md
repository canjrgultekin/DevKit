# DevKit - Claude Prompt Template: Coding Phase (DEVKIT_PATH)

Bu prompt, Claude ile kodlama aşamasında kullanılır. Claude'un ürettiği her dosyanın ilk satırına DEVKIT_PATH marker'ı koymasını zorunlu kılar. Bu sayede DevKit aracı dosyaları otomatik olarak doğru konuma yerleştirir.

---

## PROMPT (Kopyala-Yapıştır):

```
DOSYA İLETİM KURALI (DEVKIT_PATH):

Bu projede DevKit adlı bir geliştirme aracı kullanıyorum. Kodladığın her dosyanın EN BAŞINA, ilk satıra, aşağıdaki formatta bir yorum satırı eklemelisin. Bu kural zorunludur, istisnası yoktur.

FORMAT KURALLARI:

C#, Java, JavaScript, TypeScript dosyaları için:
// DEVKIT_PATH: src/ProjeAdi.Domain/Entities/Customer.cs

Python dosyaları için:
# DEVKIT_PATH: src/services/customer_service.py

HTML, XML, Razor dosyaları için:
<!-- DEVKIT_PATH: src/ProjeAdi.Api/Views/Index.cshtml -->

JSON dosyaları için (ilk key olarak):
{
  "_devkit_path": "src/ProjeAdi.Api/appsettings.json",
  ... diğer içerik
}

CSS, SCSS dosyaları için:
/* DEVKIT_PATH: src/styles/globals.css */

YAML dosyaları için:
# DEVKIT_PATH: docker-compose.yml

ZORUNLU KURALLAR:
1. Ürettiğin HER dosyanın ilk satırında DEVKIT_PATH marker'ı OLMAK ZORUNDADIR
2. Path, projenin root dizinine göre göreceli (relative) olmalıdır
3. Path'te solution adını dahil etme, sadece solution içindeki yapıyı kullan
4. Windows veya Linux path separator fark etmez, / kullan
5. Dosya adı, marker'daki path'in son segmenti ile aynı olmalıdır
6. DEVKIT_PATH satırından sonra bir boş satır bırak, ardından asıl kodu yaz
7. Bu kuralı ASLA unutma, marker'sız dosya iletme

ÖRNEK:

// DEVKIT_PATH: src/Profiqo.Domain/Entities/Customer.cs

namespace Profiqo.Domain.Entities;

public class Customer
{
    public Guid Id { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
```

---

## BİRLEŞİK PROMPT (Yapı + Kodlama kurallarını tek seferde vermek için):

```
Bu projede DevKit adlı bir geliştirme aracı kullanıyorum. İki zorunlu kural var:

KURAL 1 - PROJE YAPISI:
Proje yapısını bana JSON manifest formatında ilet. Format:
{
  "solution": "SOLUTION_ADI",
  "framework": "dotnet|nextjs|nodejs",
  "outputPath": "",
  "projects": [
    {
      "name": "Proje.Adi",
      "path": "src/Proje.Adi",
      "type": "classlib|webapi|console|worker|test|nextjs",
      "targetFramework": "net9.0",
      "folders": ["Entities", "Services"],
      "files": [{ "path": "Entities/User.cs" }],
      "dependencies": [{ "package": "MediatR", "version": "12.4.1" }],
      "projectReferences": ["Proje.Domain"]
    }
  ],
  "globalFiles": []
}

KURAL 2 - DOSYA İLETİMİ (DEVKIT_PATH):
Kodladığın her dosyanın EN BAŞINA, ilk satıra, DEVKIT_PATH marker'ı koy:

C#/JS/TS: // DEVKIT_PATH: src/Proje/Folder/File.cs
Python:   # DEVKIT_PATH: src/services/file.py
HTML:     <!-- DEVKIT_PATH: src/views/index.html -->
JSON:     "_devkit_path": "src/config/appsettings.json" (ilk key)
CSS:      /* DEVKIT_PATH: src/styles/main.css */

Bu kurallar zorunludur, istisnası yoktur. Marker'sız dosya iletme.
```

---

## KULLANIM AKIŞI:

1. Claude'a yukarıdaki birleşik prompt'u verin
2. Projenizi tarif edin
3. Claude önce JSON manifest üretir → DevKit Scaffold sayfasına yapıştırın → proje yapısı oluşur
4. Claude kodlamaya başlar, her dosyada DEVKIT_PATH marker'ı olur
5. Dosyaları Claude'dan indirin
6. DevKit File Import sayfasına sürükle-bırak yapın
7. DevKit otomatik olarak her dosyayı marker'daki path'e yerleştirir
