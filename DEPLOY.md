# راهنمای استقرار پروژه راهکار (Raahkar) با Docker

این راهنما تمام مراحل لازم برای اجرای پروژه روی سرور را قدم به قدم شرح می‌دهد.

---

## پیش‌نیازها (روی سرور)

```bash
# نصب Docker
curl -fsSL https://get.docker.com | sh

# اضافه کردن کاربر جاری به گروه docker (نیاز به logout/login بعدی)
sudo usermod -aG docker $USER

# نصب Docker Compose (معمولاً با Docker جدید همراه است)
docker compose version
# اگر نصب نبود:
sudo apt-get install -y docker-compose-plugin
```

---

## ساختار فایل‌های Docker

```
chahkaran-main/
├── docker-compose.yml          ← orchestration اصلی
├── backend/
│   ├── Dockerfile              ← image بک‌اند (FastAPI)
│   ├── .env                    ← متغیرهای محیطی بک‌اند (باید پر شود)
│   └── .env.production         ← نمونه برای production
└── frontend/
    ├── Dockerfile              ← build چند مرحله‌ای React + Nginx
    └── nginx.conf              ← تنظیمات Nginx (پروکسی API)
```

---

## قدم ۱ — انتقال کد به سرور

### گزینه الف: با Git
```bash
git clone <آدرس-ریپازیتوری> chahkaran-main
cd chahkaran-main
```

### گزینه ب: با SCP
```bash
# از ماشین لوکال:
scp -r /home/mohammad/projects/chahkaran-main user@YOUR_SERVER_IP:/home/user/
```

---

## قدم ۲ — تنظیم متغیرهای محیطی

```bash
cd chahkaran-main/backend

# کپی فایل نمونه
cp .env.production .env

# ویرایش فایل
nano .env
```

مقادیری که **حتماً باید تغییر دهید**:

| متغیر | توضیح | مثال |
|---|---|---|
| `JWT_SECRET` | کلید رمزنگاری JWT — یک رشته تصادفی قوی | `openssl rand -hex 32` |
| `EMERGENT_LLM_KEY` | کلید API هوش مصنوعی Emergent | `sk-...` |
| `CORS_ORIGINS` | دامنه‌های مجاز برای CORS | `https://raahkar.example.com` |

```bash
# تولید JWT_SECRET تصادفی
openssl rand -hex 32
```

فایل `.env` نهایی باید شبیه این باشد:

```env
MONGO_URL=mongodb://mongo:27017
DB_NAME=raahkar
JWT_SECRET=a1b2c3d4e5f6...  ← مقدار تصادفی خودتان
EMERGENT_LLM_KEY=sk-...       ← کلید واقعی
CORS_ORIGINS=*
```

> **نکته:** `MONGO_URL` را تغییر ندهید — docker-compose اتصال به سرویس mongo را مدیریت می‌کند.

---

## قدم ۳ — Build و راه‌اندازی

```bash
# از ریشه پروژه (کنار docker-compose.yml)
cd chahkaran-main

# Build و اجرا (اولین بار کمی طول می‌کشد)
docker compose up --build -d
```

### بررسی وضعیت سرویس‌ها

```bash
# وضعیت کانتینرها
docker compose ps

# لاگ همه سرویس‌ها (live)
docker compose logs -f

# لاگ فقط بک‌اند
docker compose logs -f backend

# لاگ فقط frontend
docker compose logs -f frontend
```

---

## قدم ۴ — تست صحت عملکرد

```bash
# تست بک‌اند (باید {"app":"raahkar","ok":true} برگرداند)
curl http://localhost:8000/api/

# تست فرانت‌اند (باید HTML صفحه login برگرداند)
curl -I http://localhost:80
```

اگر روی سرور با IP یا دامنه کار می‌کنید:

- فرانت‌اند: `http://YOUR_SERVER_IP` (پورت 80)
- بک‌اند API (مستقیم): `http://YOUR_SERVER_IP:8000/api/`

---

## قدم ۵ — لاگین اولیه

پس از راه‌اندازی، seed data به صورت خودکار بارگذاری می‌شود. حساب‌های کاربری پیش‌فرض:

| ایمیل | رمز عبور | نقش |
|---|---|---|
| `admin@raahkar.ir` | `admin1234` | ادمین سازمان |
| `designer@raahkar.ir` | `1234` | طراح فرایند |
| `manager@raahkar.ir` | `1234` | مدیر تیم |
| `employee@raahkar.ir` | `1234` | کارمند |

---

## معماری داخلی Docker

```
         Browser
            │
            ▼
    ┌───────────────┐
    │  frontend:80  │  (Nginx)
    │  React SPA    │
    └───────┬───────┘
            │ /api/* → proxy
            ▼
    ┌───────────────┐
    │  backend:8000 │  (FastAPI + Uvicorn)
    │               │
    └───────┬───────┘
            │ motor async
            ▼
    ┌───────────────┐
    │  mongo:27017  │  (MongoDB 7.0)
    │  data volume  │
    └───────────────┘
```

- تمام API calls از browser به `/api/...` می‌روند
- Nginx این درخواست‌ها را به سرویس `backend` پروکسی می‌کند
- SSE (streaming AI) هم از طریق همین پروکسی کار می‌کند
- داده‌های MongoDB در volume ماندگار ذخیره می‌شوند

---

## دستورات مدیریت

### توقف و راه‌اندازی مجدد

```bash
# توقف (کانتینرها حذف می‌شوند، داده‌ها باقی می‌مانند)
docker compose down

# راه‌اندازی مجدد بدون rebuild
docker compose up -d

# راه‌اندازی مجدد با rebuild (بعد از تغییر کد)
docker compose up --build -d
```

### Update کردن پروژه

```bash
git pull origin main
docker compose up --build -d
```

### پشتیبان‌گیری از دیتابیس

```bash
# dump از MongoDB
docker exec raahkar_mongo mongodump \
  --db raahkar \
  --out /tmp/raahkar_backup_$(date +%Y%m%d)

# کپی backup به host
docker cp raahkar_mongo:/tmp/raahkar_backup_$(date +%Y%m%d) ./backups/
```

### بازیابی دیتابیس

```bash
docker cp ./backups/raahkar_backup_YYYYMMDD raahkar_mongo:/tmp/restore
docker exec raahkar_mongo mongorestore \
  --db raahkar \
  /tmp/restore/raahkar
```

### پاک کردن کامل (داده‌ها هم حذف می‌شوند!)

```bash
docker compose down -v  # ⚠️ حجم داده هم پاک می‌شود
```

---

## تنظیم HTTPS با Nginx Reverse Proxy (اختیاری)

اگر می‌خواهید HTTPS داشته باشید، یک Nginx خارجی یا Caddy روی سرور نصب کنید:

### با Caddy (ساده‌ترین روش)

```bash
sudo apt install caddy

# ویرایش /etc/caddy/Caddyfile:
your-domain.com {
    reverse_proxy localhost:80
}
```

### با Certbot + Nginx (سیستم)

```bash
sudo apt install nginx certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

در این حالت، پورت 80 سرور را به کانتینر فرانت‌اند نمی‌دهید — بلکه nginx سیستمی را proxy می‌کنید.

---

## رفع مشکلات رایج

### خطای "port already in use"

```bash
# ببینید کدام پروسه از پورت 80 استفاده می‌کند
sudo lsof -i :80
sudo lsof -i :8000
```

اگر Nginx سیستمی داری:
```bash
sudo systemctl stop nginx
docker compose up -d
```

### بک‌اند seed نشد

```bash
# لاگ بک‌اند را بررسی کن
docker compose logs backend | grep -i seed

# اگر خطا داشت، restart کن
docker compose restart backend
```

### MongoDB وصل نمی‌شود

```bash
# تست اتصال
docker exec raahkar_backend python -c "
import asyncio, motor.motor_asyncio
client = motor.motor_asyncio.AsyncIOMotorClient('mongodb://mongo:27017')
asyncio.run(client.admin.command('ping'))
print('MongoDB OK')
"
```

### خطای `EMERGENT_LLM_KEY`

```bash
# بررسی کن که .env درست لود شده
docker exec raahkar_backend env | grep EMERGENT
```

---

## منابع

- [Docker Documentation](https://docs.docker.com)
- [FastAPI Documentation](https://fastapi.tiangolo.com)
- [MongoDB Docker Hub](https://hub.docker.com/_/mongo)
