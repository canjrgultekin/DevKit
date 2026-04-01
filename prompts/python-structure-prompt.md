# DevKit - Claude/ChatGPT Prompt: Python Project Structure

Aşağıdaki manifest örneği Python projeleri için DevKit scaffold formatını gösterir. Ana prompt'a (devkit-claude-prompt.md veya devkit-chatgpt-prompt.md) ek olarak kullanılabilir, ya da doğrudan manifest JSON olarak verilebilir.

---

## Python Manifest Kuralları

- "framework" değeri "python" olmalıdır
- "type" şunlardan biri olabilir: "fastapi", "flask", "django", "script" (generic)
- "targetFramework" Python versiyonunu belirtir: "3.12", "3.13" vs.
- "dependencies" pip paketleri: { "package": "fastapi", "version": "0.115.0" }
- Version boş bırakılırsa veya "*" verilirse latest kurulur
- "folders" src/ altındaki klasör yapısını tanımlar
- "files" src/ altındaki Python dosyalarını tanımlar
- DEVKIT_PATH marker'ı Python dosyalarında # ile başlar: # DEVKIT_PATH: src/app/main.py

---

## Örnek: FastAPI Projesi

```json
{
  "solution": "OrderService",
  "framework": "python",
  "outputPath": "",
  "projects": [
    {
      "name": "order-service",
      "path": ".",
      "type": "fastapi",
      "targetFramework": "3.12",
      "folders": [
        "src/order_service/api/routes",
        "src/order_service/core",
        "src/order_service/models",
        "src/order_service/schemas",
        "src/order_service/services",
        "src/order_service/repositories",
        "tests"
      ],
      "files": [
        { "path": "src/order_service/main.py" },
        { "path": "src/order_service/core/config.py" },
        { "path": "src/order_service/core/database.py" },
        { "path": "src/order_service/models/order.py" },
        { "path": "src/order_service/schemas/order_schema.py" },
        { "path": "src/order_service/services/order_service.py" },
        { "path": "src/order_service/repositories/order_repository.py" },
        { "path": "src/order_service/api/routes/order_routes.py" },
        { "path": "tests/test_order_service.py" }
      ],
      "dependencies": [
        { "package": "fastapi", "version": "0.115.0" },
        { "package": "uvicorn", "version": "0.34.0" },
        { "package": "sqlalchemy", "version": "2.0.0" },
        { "package": "alembic", "version": "1.14.0" },
        { "package": "pydantic", "version": "2.10.0" },
        { "package": "pydantic-settings", "version": "2.7.0" },
        { "package": "asyncpg", "version": "0.30.0" },
        { "package": "python-dotenv", "version": "1.0.0" }
      ],
      "projectReferences": [],
      "scripts": {},
      "npmDependencies": {},
      "npmDevDependencies": {}
    }
  ],
  "globalFiles": []
}
```

## Scaffold Sonucu (DevKit otomatik oluşturur):

```
OrderService/
├── pyproject.toml              (dependencies dahil)
├── requirements.txt            (pip install -r için)
├── Dockerfile                  (uvicorn CMD ile)
├── .env.example
├── .gitignore
├── src/
│   └── order_service/
│       ├── __init__.py
│       ├── main.py             (FastAPI app, health endpoint)
│       ├── core/
│       │   ├── __init__.py
│       │   ├── config.py       (pydantic-settings)
│       │   └── database.py
│       ├── api/
│       │   ├── __init__.py
│       │   └── routes/
│       │       ├── __init__.py
│       │       └── order_routes.py
│       ├── models/
│       │   ├── __init__.py
│       │   └── order.py
│       ├── schemas/
│       │   ├── __init__.py
│       │   └── order_schema.py
│       ├── services/
│       │   ├── __init__.py
│       │   └── order_service.py
│       └── repositories/
│           ├── __init__.py
│           └── order_repository.py
├── tests/
│   ├── __init__.py
│   └── test_order_service.py
└── alembic/
```

---

## Örnek: Django Projesi

```json
{
  "solution": "BlogPlatform",
  "framework": "python",
  "outputPath": "",
  "projects": [
    {
      "name": "blog-platform",
      "path": ".",
      "type": "django",
      "targetFramework": "3.12",
      "folders": [
        "src/blog_platform/apps/posts",
        "src/blog_platform/apps/users",
        "src/templates",
        "src/static",
        "tests"
      ],
      "files": [
        { "path": "src/blog_platform/apps/posts/models.py" },
        { "path": "src/blog_platform/apps/posts/views.py" },
        { "path": "src/blog_platform/apps/posts/serializers.py" },
        { "path": "src/blog_platform/apps/posts/urls.py" },
        { "path": "src/blog_platform/apps/users/models.py" },
        { "path": "src/blog_platform/apps/users/views.py" },
        { "path": "tests/test_posts.py" }
      ],
      "dependencies": [
        { "package": "django", "version": "5.1.0" },
        { "package": "djangorestframework", "version": "3.15.0" },
        { "package": "psycopg2-binary", "version": "2.9.0" },
        { "package": "python-dotenv", "version": "1.0.0" },
        { "package": "gunicorn", "version": "23.0.0" }
      ],
      "projectReferences": [],
      "scripts": {},
      "npmDependencies": {},
      "npmDevDependencies": {}
    }
  ],
  "globalFiles": []
}
```

---

## Örnek: Flask Projesi

```json
{
  "solution": "NotificationService",
  "framework": "python",
  "outputPath": "",
  "projects": [
    {
      "name": "notification-service",
      "path": ".",
      "type": "flask",
      "targetFramework": "3.12",
      "folders": [
        "src/notification_service/routes",
        "src/notification_service/models",
        "src/notification_service/services",
        "src/templates",
        "tests"
      ],
      "files": [
        { "path": "src/notification_service/app.py" },
        { "path": "src/notification_service/routes/notification_routes.py" },
        { "path": "src/notification_service/models/notification.py" },
        { "path": "src/notification_service/services/email_sender.py" },
        { "path": "tests/test_notifications.py" }
      ],
      "dependencies": [
        { "package": "flask", "version": "3.1.0" },
        { "package": "sqlalchemy", "version": "2.0.0" },
        { "package": "python-dotenv", "version": "1.0.0" },
        { "package": "celery", "version": "5.4.0" },
        { "package": "redis", "version": "5.2.0" }
      ],
      "projectReferences": [],
      "scripts": {},
      "npmDependencies": {},
      "npmDevDependencies": {}
    }
  ],
  "globalFiles": []
}
```

---

## DEVKIT_PATH Örnekleri (Python)

```python
# DEVKIT_PATH: src/order_service/models/order.py

from sqlalchemy import Column, String, Float, DateTime, Enum
from sqlalchemy.dialects.postgresql import UUID
from order_service.core.database import Base
import uuid
from datetime import datetime


class Order(Base):
    __tablename__ = "orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_name = Column(String(200), nullable=False)
    total_amount = Column(Float, nullable=False)
    status = Column(String(50), default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)
```

```yaml
# DEVKIT_PATH: docker-compose.yml

version: "3.8"
services:
  app:
    build: .
    ports:
      - "8000:8000"
    env_file:
      - .env
    depends_on:
      - db
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: orderservice
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
```
