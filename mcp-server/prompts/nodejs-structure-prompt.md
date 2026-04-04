# DevKit - Claude Prompt Template: Node.js Project Structure

---

## PROMPT (Kopyala-Yapıştır):

```
PROJE YAPISI KURALI:

Bu projede DevKit adlı bir geliştirme aracı kullanıyorum. Proje yapısını bana aşağıdaki JSON formatında iletmelisin.

{
  "solution": "PROJE_ADI",
  "framework": "nodejs",
  "outputPath": "",
  "projects": [
    {
      "name": "proje-adi",
      "path": ".",
      "type": "nodejs",
      "targetFramework": "",
      "folders": [
        "src/routes",
        "src/services",
        "src/middleware",
        "src/types",
        "src/config",
        "src/models"
      ],
      "files": [
        { "path": "src/index.ts" },
        { "path": "src/routes/userRoutes.ts" },
        { "path": "src/services/userService.ts" }
      ],
      "dependencies": [],
      "projectReferences": [],
      "scripts": {
        "dev": "tsx watch src/index.ts",
        "build": "tsc",
        "start": "node dist/index.js"
      },
      "npmDependencies": {
        "express": "^5.1.0",
        "zod": "^3.24.4"
      },
      "npmDevDependencies": {
        "typescript": "^5.8.3",
        "@types/node": "^22.15.3",
        "@types/express": "^5.0.3",
        "tsx": "^4.19.3"
      }
    }
  ],
  "globalFiles": []
}

KURALLAR:
1. "framework" değeri "nodejs" olmalıdır
2. npm bağımlılıkları ilgili alanlarda belirtilmelidir
3. "scripts" objesi package.json'daki script komutlarını içermelidir
4. Bu JSON'ı tek bir JSON bloğu olarak ilet
```
