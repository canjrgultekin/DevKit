# DevKit - Claude Prompt Template: .NET Project Structure

Aşağıdaki prompt'u Claude'a projenizin en başında verin. Claude, solution yapısını DevKit'in anlayacağı JSON manifest formatında üretecektir.

---

## PROMPT (Kopyala-Yapıştır):

```
PROJE YAPISI KURALI:

Bu projede DevKit adlı bir geliştirme aracı kullanıyorum. Proje yapısını bana aşağıdaki JSON formatında iletmelisin. Bu format zorunludur, başka bir formatta iletme.

JSON formatı şu şekilde olmalıdır:

{
  "solution": "SOLUTION_ADI",
  "framework": "dotnet",
  "outputPath": "",
  "projects": [
    {
      "name": "SolutionAdi.Domain",
      "path": "src/SolutionAdi.Domain",
      "type": "classlib",
      "targetFramework": "net9.0",
      "folders": ["Entities", "ValueObjects", "Interfaces", "Enums", "Events"],
      "files": [
        { "path": "Entities/Customer.cs" },
        { "path": "Interfaces/ICustomerRepository.cs" }
      ],
      "dependencies": [],
      "projectReferences": []
    },
    {
      "name": "SolutionAdi.Api",
      "path": "src/SolutionAdi.Api",
      "type": "webapi",
      "targetFramework": "net9.0",
      "folders": ["Controllers", "Middleware", "Filters"],
      "files": [
        { "path": "Controllers/CustomerController.cs" },
        { "path": "Program.cs" }
      ],
      "dependencies": [
        { "package": "MediatR", "version": "12.4.1" },
        { "package": "Serilog.AspNetCore", "version": "9.0.0" }
      ],
      "projectReferences": ["SolutionAdi.Domain", "SolutionAdi.Application"]
    }
  ],
  "globalFiles": [
    {
      "path": ".gitignore",
      "content": "bin/\nobj/\n*.user\n.vs/\nappsettings.Local.json"
    },
    {
      "path": ".editorconfig",
      "content": "root = true\n[*.cs]\nindent_style = space\nindent_size = 4"
    }
  ]
}

KURALLAR:
1. "type" alanı şunlardan biri olabilir: classlib, webapi, console, worker, test
2. "targetFramework" şunlardan biri olabilir: net8.0, net9.0, net10.0
3. Her projenin tüm klasörleri "folders" dizisinde, tüm dosyaları "files" dizisinde listelenmelidir
4. NuGet bağımlılıkları "dependencies" dizisinde paket adı ve versiyon ile belirtilmelidir
5. Projeler arası referanslar "projectReferences" dizisinde proje adı ile belirtilmelidir
6. "files" içindeki "content" alanı opsiyoneldir; verilmezse DevKit boş class/interface oluşturur
7. Bu JSON'ı başka açıklama eklemeden, tek bir JSON bloğu olarak ilet
```

---

## KULLANIM:

1. Yukarıdaki prompt'u Claude'a verin
2. Projenizi tarif edin (örn: "E-ticaret CRM, Clean Architecture, CQRS, 5 katmanlı")
3. Claude size JSON manifest üretecek
4. Bu JSON'ı DevKit'in Scaffold sayfasına yapıştırın
5. Output path'i belirleyip "Scaffold Project" butonuna basın
6. Tüm solution yapısı diskinizdeki belirtilen konumda oluşturulacak
