# DevKit - Claude Prompt Template: Next.js Project Structure

Aşağıdaki prompt'u Claude'a projenizin en başında verin.

---

## PROMPT (Kopyala-Yapıştır):

```
PROJE YAPISI KURALI:

Bu projede DevKit adlı bir geliştirme aracı kullanıyorum. Proje yapısını bana aşağıdaki JSON formatında iletmelisin. Bu format zorunludur.

{
  "solution": "PROJE_ADI",
  "framework": "nextjs",
  "outputPath": "",
  "projects": [
    {
      "name": "proje-adi",
      "path": ".",
      "type": "nextjs",
      "targetFramework": "",
      "folders": [
        "src/app/dashboard",
        "src/app/customers",
        "src/app/api/auth",
        "src/components/ui",
        "src/components/layout",
        "src/lib",
        "src/hooks",
        "src/types",
        "src/services"
      ],
      "files": [
        { "path": "src/app/dashboard/page.tsx" },
        { "path": "src/app/customers/page.tsx" },
        { "path": "src/components/ui/Button.tsx" },
        { "path": "src/lib/api-client.ts" },
        { "path": "src/types/customer.ts" }
      ],
      "dependencies": [],
      "projectReferences": [],
      "npmDependencies": {
        "next": "15.3.2",
        "react": "^19.1.0",
        "react-dom": "^19.1.0",
        "tailwindcss": "^4.1.4"
      },
      "npmDevDependencies": {
        "typescript": "^5.8.3",
        "@types/react": "^19.1.2",
        "@types/node": "^22.15.3"
      }
    }
  ],
  "globalFiles": []
}

KURALLAR:
1. "framework" değeri "nextjs" olmalıdır
2. Tüm klasörler "folders" dizisinde tam yol ile belirtilmelidir (src/app/dashboard gibi)
3. Tüm dosyalar "files" dizisinde tam yol ile belirtilmelidir
4. npm bağımlılıkları "npmDependencies" ve "npmDevDependencies" objelerinde paket:versiyon formatında verilmelidir
5. Bu JSON'ı başka açıklama eklemeden, tek bir JSON bloğu olarak ilet
```
