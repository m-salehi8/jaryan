# ۱۰. راهنمای استقرار

## گزینه ۱: Docker (توصیه‌شده برای Production)

### پیش‌نیازها

```bash
# نصب Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER  # (نیاز به logout/login)

# بررسی نصب
docker compose version
```

### قدم به قدم

#### ۱. دریافت کد
```bash
# گزینه الف: Git
git clone <repo-url> chahkaran-main
cd chahkaran-main

# گزینه ب: SCP از لوکال
scp -r /home/mohammad/projects/chahkaran-main user@SERVER_IP:/home/user/
```

#### ۲. تنظیم متغیرهای محیطی

```bash
cd chahkaran-main/backend
cp .env.production .env
nano .env
```

**محتوای `.env` نهایی:**
```env
MONGO_URL=mongodb://mongo:27017
DB_NAME=jaryan
JWT_SECRET=<کلید تصادفی قوی>
EMERGENT_LLM_KEY=<کلید API هوش مصنوعی>
CORS_ORIGINS=*
```

**تولید JWT_SECRET:**
```bash
openssl rand -hex 32
```

#### ۳. Build و راه‌اندازی

```bash
cd chahkaran-main
docker compose up --build -d
```

#### ۴. تست

```bash
# Backend health check
curl http://localhost:8000/api/
# → {"app":"jaryan","ok":true}

# Frontend
curl -I http://localhost:80
# → HTTP/1.1 200 OK
```

---

## ساختار Docker

```
Browser
   │
   ▼
frontend:80 (Nginx)
   │ /api/* → proxy
   ▼
backend:8000 (FastAPI + Uvicorn)
   │ motor async
   ▼
mongo:27017 (MongoDB 7.0)
   │
mongo_data volume (ماندگار)
```

### سرویس‌های docker-compose.yml

| سرویس | Port | Image |
|-------|------|-------|
| `mongo` | 27017 | mongo:7.0 |
| `backend` | 8000 | Dockerfile |
| `frontend` | 80 | Dockerfile (multi-stage) |

---

## دستورات مدیریت

```bash
# وضعیت سرویس‌ها
docker compose ps

# لاگ زنده
docker compose logs -f
docker compose logs -f backend   # فقط backend
docker compose logs -f frontend  # فقط frontend

# توقف (داده محفوظ است)
docker compose down

# راه‌اندازی مجدد
docker compose up -d

# راه‌اندازی مجدد با rebuild بعد از تغییر کد
docker compose up --build -d

# Update پروژه
git pull origin main
docker compose up --build -d
```

---

## پشتیبان‌گیری از دیتابیس

```bash
# گرفتن backup
docker exec jaryan_mongo mongodump \
  --db jaryan \
  --out /tmp/jaryan_backup_$(date +%Y%m%d)

# کپی به host
docker cp jaryan_mongo:/tmp/jaryan_backup_$(date +%Y%m%d) ./backups/

# بازیابی backup
docker cp ./backups/jaryan_backup_YYYYMMDD jaryan_mongo:/tmp/restore
docker exec jaryan_mongo mongorestore \
  --db jaryan \
  /tmp/restore/jaryan
```

---

## HTTPS با Caddy (ساده‌ترین روش)

```bash
sudo apt install caddy
```

**`/etc/caddy/Caddyfile`:**
```
your-domain.com {
    reverse_proxy localhost:80
}
```

```bash
sudo systemctl enable caddy
sudo systemctl start caddy
```

---

## HTTPS با Nginx + Certbot

```bash
sudo apt install nginx certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

**`/etc/nginx/sites-enabled/jaryan.conf`:**
```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;
    
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    location / {
        proxy_pass http://localhost:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## رفع مشکلات رایج

### خطای "port already in use"
```bash
sudo lsof -i :80
sudo lsof -i :8000
sudo systemctl stop nginx  # اگر nginx سیستمی روشن است
```

### Backend seed نشد
```bash
docker compose logs backend | grep -i seed
docker compose restart backend
```

### MongoDB متصل نمی‌شود
```bash
docker exec jaryan_backend python -c "
import asyncio, motor.motor_asyncio
client = motor.motor_asyncio.AsyncIOMotorClient('mongodb://mongo:27017')
asyncio.run(client.admin.command('ping'))
print('MongoDB OK')
"
```

### بررسی متغیرهای محیطی
```bash
docker exec jaryan_backend env | grep -E "(JWT|EMERGENT|MONGO)"
```

### پاک کردن کامل (⚠️ داده از دست می‌رود)
```bash
docker compose down -v
```

---

## گزینه ۲: اجرا بدون Docker (Development)

### پیش‌نیازها
- Python 3.10+
- Node.js 18+
- MongoDB 7.0

### نصب MongoDB
```bash
# Ubuntu/Debian
curl -fsSL https://pgp.mongodb.com/server-7.0.asc | \
  sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor

echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] \
  https://repo.mongodb.org/apt/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME)/mongodb-org/7.0 multiverse" | \
  sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

sudo apt-get update && sudo apt-get install -y mongodb-org
sudo systemctl enable mongod && sudo systemctl start mongod
```

### Backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# تنظیم .env:
cp .env.production .env
# ویرایش: MONGO_URL=mongodb://localhost:27017

uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

### Frontend
```bash
cd frontend
corepack enable
yarn install

REACT_APP_BACKEND_URL=http://localhost:8000 yarn start
# → http://localhost:3000
```

---

## Health Checks

```bash
# Backend
curl http://localhost:8000/api/
# → {"app":"jaryan","ok":true}

# MongoDB (inside container)
docker exec jaryan_mongo mongosh --eval "db.adminCommand('ping')"
# → { ok: 1 }

# Frontend
curl -I http://localhost
# → HTTP/1.1 200 OK
```
