# DevKit - Claude Prompt (Türkçe)

Aşağıdaki prompt'u Claude ile yeni bir proje geliştirmeye başlarken conversation'ın en başına yapıştırın. Bu prompt Claude'u üç konuda zorunlu kurala bağlar: proje yapısını DevKit manifest formatında iletmesi, kodladığı her dosyanın başına DEVKIT_PATH marker'ı koyması ve dosyaları download edilebilir şekilde iletmesi.

---

## PROMPT (Kopyala-Yapıştır):

```
Bu projede DevKit adlı bir geliştirme aracı kullanıyorum. Aşağıdaki üç kural bu conversation boyunca her zaman geçerlidir, istisnası yoktur.

===== KURAL 1: PROJE YAPISI (MANIFEST JSON) =====

Projenin yapısını (solution, projeler, klasörler, dosyalar, bağımlılıklar) bana iletirken aşağıdaki JSON formatını kullan. Bu format zorunludur, başka formatta iletme.

{
  "solution": "SolutionAdi",
  "framework": "dotnet",
  "outputPath": "",
  "projects": [
    {
      "name": "SolutionAdi.Domain",
      "path": "src/SolutionAdi.Domain",
      "type": "classlib",
      "targetFramework": "net9.0",
      "folders": ["Entities", "Interfaces", "Enums"],
      "files": [
        { "path": "Entities/Customer.cs" },
        { "path": "Interfaces/ICustomerRepository.cs" }
      ],
      "dependencies": [],
      "projectReferences": [],
      "scripts": {},
      "npmDependencies": {},
      "npmDevDependencies": {}
    }
  ],
  "globalFiles": []
}

Manifest kuralları:
- "framework": "dotnet", "nextjs" veya "nodejs" olabilir
- "type": .NET için "classlib", "webapi", "console", "worker", "test" olabilir
- "targetFramework": "net8.0", "net9.0", "net10.0" olabilir
- "folders": projedeki tüm klasörleri listele
- "files": projedeki tüm dosyaları path ile listele (content opsiyonel)
- "dependencies": NuGet paketleri { "package": "...", "version": "..." } formatında
- "projectReferences": projeler arası referanslar, proje adı ile
- Next.js/Node.js projeleri için "npmDependencies" ve "npmDevDependencies" objelerini doldur
- "globalFiles": solution root'una eklenecek dosyalar (.gitignore, .editorconfig vs.)
- Bu JSON'ı tek bir JSON code block olarak ilet, etrafına açıklama ekleme

===== KURAL 2: DOSYA İLETİMİ (DEVKIT_PATH) =====

Kodladığın her dosyanın EN BAŞINA, ilk satıra, aşağıdaki formatta bir yorum satırı ekle. Bu kural zorunludur, istisnası yoktur. Marker'sız dosya iletme.

Formatlar (dosya tipine göre):

C#, JavaScript, TypeScript, Java:
// DEVKIT_PATH: src/ProjeAdi/Klasor/Dosya.cs

Python, YAML:
# DEVKIT_PATH: src/services/dosya.py

HTML, XML, Razor:
<!-- DEVKIT_PATH: src/ProjeAdi/Views/Index.cshtml -->

CSS, SCSS:
/* DEVKIT_PATH: src/styles/globals.css */

JSON (ilk key olarak):
{
  "_devkit_path": "src/ProjeAdi/appsettings.json",
  ...diger icerik
}

DEVKIT_PATH kuralları:
- Path, projenin root dizinine göre relative olmalı (solution adını dahil etme)
- Her zaman / (forward slash) kullan
- DEVKIT_PATH satırından sonra bir boş satır bırak, sonra asıl kodu yaz
- Dosya adı, path'in son segmenti ile aynı olmalı
- Bu kuralı ASLA unutma

===== KURAL 3: DOSYALARI DOWNLOAD EDİLEBİLİR İLET =====

Geliştirdiğin kodları chat içine düz metin olarak yazma. Her dosyayı mutlaka DOWNLOAD EDİLEBİLİR DOSYA olarak ilet. Ben bu dosyaları indirip DevKit'e sürükle-bırak yapacağım.

Dosya iletim kuralları:
- Her dosyayı ayrı bir dosya olarak oluştur ve download linkiyle ilet
- Dosya adı, DEVKIT_PATH marker'ındaki path'in son segmenti ile aynı olmalı (örn: CustomerController.cs, appsettings.json, page.tsx)
- Kod bloğu içine yazıp "bunu kopyalayın" deme, dosya olarak ilet
- Birden fazla dosya varsa hepsini ayrı ayrı download edilebilir dosya olarak ilet
- Bu kural manifest JSON için geçerli değil, manifest'i code block olarak iletebilirsin

===== ÇALIŞMA AKIŞI =====

1. Ben projeyi tarif ederim
2. Sen önce proje yapısını KURAL 1'deki JSON manifest formatında ilet (code block olarak)
3. Ben DevKit'te bu JSON'ı yapıştırıp projeyi scaffold ederim
4. Sonra kodlamaya geçersin, her dosyada KURAL 2'deki DEVKIT_PATH marker'ı olur
5. Her dosyayı KURAL 3'e göre download edilebilir dosya olarak iletirsin
6. Ben dosyaları indirip DevKit'e sürükle-bırak yaparım, DevKit marker'a bakarak doğru konuma yerleştirir
```

---

## PROMPT (English):

```
I use a development tool called DevKit. The following three rules apply throughout this entire conversation, no exceptions.

===== RULE 1: PROJECT STRUCTURE (MANIFEST JSON) =====

When communicating the project structure (solution, projects, folders, files, dependencies), use this exact JSON format. This format is mandatory.

{
  "solution": "SolutionName",
  "framework": "dotnet",
  "outputPath": "",
  "projects": [
    {
      "name": "SolutionName.Domain",
      "path": "src/SolutionName.Domain",
      "type": "classlib",
      "targetFramework": "net9.0",
      "folders": ["Entities", "Interfaces", "Enums"],
      "files": [
        { "path": "Entities/Customer.cs" },
        { "path": "Interfaces/ICustomerRepository.cs" }
      ],
      "dependencies": [],
      "projectReferences": [],
      "scripts": {},
      "npmDependencies": {},
      "npmDevDependencies": {}
    }
  ],
  "globalFiles": []
}

Manifest rules:
- "framework": "dotnet", "nextjs", or "nodejs"
- "type": for .NET use "classlib", "webapi", "console", "worker", "test"
- "targetFramework": "net8.0", "net9.0", "net10.0"
- "folders": list all directories in the project
- "files": list all files with their relative path (content is optional)
- "dependencies": NuGet packages as { "package": "...", "version": "..." }
- "projectReferences": inter-project references by project name
- For Next.js/Node.js fill "npmDependencies" and "npmDevDependencies"
- "globalFiles": files at solution root (.gitignore, .editorconfig etc.)
- Deliver this JSON as a single JSON code block with no surrounding explanation

===== RULE 2: FILE DELIVERY (DEVKIT_PATH) =====

Add a path marker comment as the FIRST LINE of every file you code. This rule is mandatory with no exceptions. Never deliver a file without the marker.

Formats by file type:

C#, JavaScript, TypeScript, Java:
// DEVKIT_PATH: src/ProjectName/Folder/File.cs

Python, YAML:
# DEVKIT_PATH: src/services/file.py

HTML, XML, Razor:
<!-- DEVKIT_PATH: src/ProjectName/Views/Index.cshtml -->

CSS, SCSS:
/* DEVKIT_PATH: src/styles/globals.css */

JSON (as first key):
{
  "_devkit_path": "src/ProjectName/appsettings.json",
  ...rest of content
}

DEVKIT_PATH rules:
- Path must be relative to the project root (do not include solution name)
- Always use / (forward slash)
- Leave one blank line after the DEVKIT_PATH line before actual code
- The filename must match the last segment of the path
- NEVER forget this rule

===== RULE 3: DELIVER FILES AS DOWNLOADABLE =====

Do NOT write code as plain text in the chat. Every file you develop MUST be delivered as a DOWNLOADABLE FILE. I will download these files and drag-drop them into DevKit.

File delivery rules:
- Create each file as a separate downloadable file with a download link
- The filename must match the last segment of the DEVKIT_PATH marker (e.g., CustomerController.cs, appsettings.json, page.tsx)
- Do NOT paste code in a code block and say "copy this" — deliver it as a file
- If there are multiple files, deliver each one as a separate downloadable file
- This rule does NOT apply to the manifest JSON — you can deliver the manifest as a code block

===== WORKFLOW =====

1. I describe the project
2. You first deliver the project structure as RULE 1 manifest JSON (as a code block)
3. I paste the JSON in DevKit and scaffold the project
4. Then you start coding, every file has the RULE 2 DEVKIT_PATH marker
5. You deliver every file as a downloadable file per RULE 3
6. I download files and drag-drop them into DevKit, which places them at the correct location using the marker
```