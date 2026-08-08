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
DB_HOST=db
DB_PORT=5432
DB_USER=postgres
DB_PASS=postgres
DB_NAME=jaryan

MONGO_URL=mongodb://mongo:27017
MONGO_DB_NAME=jaryan

REDIS_URL=redis://redis:6379/0

SECRET_KEY=<کلید تصادفی قوی برای جنگو>
EMERGENT_LLM_KEY=<کلید API هوش مصنوعی>
CORS_ALLOW_ALL_ORIGINS=True
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
backend:8000 (Django + Gunicorn)
   ├── PostgreSQL:5432 (داده‌های اصلی و مدل‌های پایه)
   ├── MongoDB:27017 (لاگ‌ها و Process Instances)
   └── Redis:6379 (Broker برای Celery)
       └── Celery Worker / Beat (تسک‌های پس‌زمینه)
```

### سرویس‌های docker-compose.yml

| سرویس | Port | Image / توضیح |
|-------|------|-------|
| `db` | 5432 | postgres:15-alpine |
| `mongo` | 27017 | mongo:7.0 |
| `redis` | 6379 | redis:alpine |
| `backend` | 8000 | Dockerfile (gunicorn jaryan.wsgi) |
| `celery_worker`| — | Dockerfile (celery -A jaryan worker) |
| `celery_beat`  | — | Dockerfile (celery -A jaryan beat) |
| `frontend` | 80 | Dockerfile (Nginx + React build) |

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
docker exec jaryan_mongo mongosh --eval "db.adminCommand('ping')"
```

### بررسی متغیرهای محیطی
```bash
docker exec jaryan_backend env | grep -E "(DB_|MONGO|REDIS|SECRET)"
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
# ویرایش: MONGO_URL=mongodb://localhost:27017, REDIS_URL=... و تنظیمات دیتابیس

python manage.py migrate
python manage.py runserver 0.0.0.0:8000

# در یک ترمینال دیگر برای تسک‌های پس‌زمینه:
celery -A jaryan worker -l INFO
celery -A jaryan beat -l INFO
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
