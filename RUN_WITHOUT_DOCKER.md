# راهنمای اجرای پروژه بدون Docker

این راهنما برای اجرای پروژه روی لینوکس/Ubuntu بدون استفاده از Docker نوشته شده است. در این روش:
- MongoDB روی میزبان اجرا می‌شود.
- بک‌اند FastAPI به‌صورت مستقیم با Python اجرا می‌شود.
- فرانت‌اند React با Yarn/CRA اجرا می‌شود.

---

## پیش‌نیازها

برای اجرای صحیح باید این ابزارها نصب باشند:
- Python 3.10+ (در محیط فعلی Python 3.14.4 موجود است)
- Node.js 18+ / 20+
- npm / Corepack
- MongoDB

اگر MongoDB روی سیستم نصب نیست، ابتدا آن را نصب کنید.

---

## ۱) نصب MongoDB روی Ubuntu/Debian

```bash
sudo apt-get update
sudo apt-get install -y gnupg curl

curl -fsSL https://pgp.mongodb.com/server-7.0.asc | \
  sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg \
  --dearmor

echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME)/mongodb-org/7.0 multiverse" | \
  sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

sudo apt-get update
sudo apt-get install -y mongodb-org

sudo systemctl enable mongod
sudo systemctl start mongod
```

بررسی سلامت MongoDB:

```bash
mongosh --eval 'db.adminCommand({ ping: 1 })'
```

اگر خروجی `{"ok": 1}` را دیدید، MongoDB آماده است.

---

## ۲) نصب وابستگی‌های بک‌اند

```bash
cd /home/mohammad/projects/chahkaran-main/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

اگر فایل محیطی وجود ندارد، آن را از نمونه بسازید:

```bash
cp .env.production .env
```

فایل فعلی پروژه در این مسیر از قبل تنظیم شده است و شامل مقادیر زیر است:

```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=raahkar
JWT_SECRET=dev-secret-change-in-prod
EMERGENT_LLM_KEY=sk-placeholder
CORS_ORIGINS=*
```

> اگر در محیط واقعی کار می‌کنید، بهتر است `JWT_SECRET` و `EMERGENT_LLM_KEY` را با مقادیر واقعی جایگزین کنید.

---

## ۳) اجرای بک‌اند

```bash
cd /home/mohammad/projects/chahkaran-main/backend
source .venv/bin/activate
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

پس از اجرا، API در آدرس زیر در دسترس است:

```text
http://localhost:8000/api/
```

برای تست سلامت:

```bash
curl http://localhost:8000/api/
```

باید پاسخی مشابه این دریافت کنید:

```json
{"app":"raahkar","ok":true}
```

---

## ۴) نصب وابستگی‌های فرانت‌اند

```bash
cd /home/mohammad/projects/chahkaran-main/frontend
corepack enable
yarn install --network-timeout 600000
```

> در این پروژه از Yarn 1.x استفاده شده است. اگر Yarn روی سیستم نصب نبود، Corepack آن را فراهم می‌کند.

---

## ۵) اجرای فرانت‌اند

```bash
cd /home/mohammad/projects/chahkaran-main/frontend
REACT_APP_BACKEND_URL=http://localhost:8000 yarn start
```

پس از اجرا، اپلیکیشن در آدرس زیر باز می‌شود:

```text
http://localhost:3000
```

---

## ۶) ورود اولیه به سیستم

پس از راه‌اندازی، داده‌های نمونه (seed data) به‌صورت خودکار در دیتابیس ایجاد می‌شوند. حساب‌های پیش‌فرض:

| ایمیل | رمز عبور | نقش |
|---|---|---|
| admin@raahkar.ir | admin1234 | ادمین سازمان |
| designer@raahkar.ir | 1234 | طراح فرایند |
| manager@raahkar.ir | 1234 | مدیر تیم |
| employee@raahkar.ir | 1234 | کارمند |

---

## ۷) راه‌اندازی در دو ترمینال جداگانه

بهترین روش برای توسعه، اجرای جداگانه این دو سرویس است:

ترمینال ۱ (بک‌اند):
```bash
cd /home/mohammad/projects/chahkaran-main/backend
source .venv/bin/activate
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

ترمینال ۲ (فرانت‌اند):
```bash
cd /home/mohammad/projects/chahkaran-main/frontend
corepack enable
yarn start
```

---

## ۸) مشکلات رایج

### خطای اتصال به MongoDB
```bash
mongo
```

اگر اتصال برقرار نشد:
```bash
sudo systemctl status mongod
sudo journalctl -u mongod -n 50
```

### خطای `yarn: command not found`
```bash
corepack enable
```

### خطای پورت پر شده
اگر پورت 8000 یا 3000 در حال استفاده باشد، یک پورت دیگر انتخاب کنید:

```bash
uvicorn server:app --reload --host 0.0.0.0 --port 8100
```

و در فرانت‌اند:

```bash
PORT=3001 REACT_APP_BACKEND_URL=http://localhost:8100 yarn start
```

---

## ۹) نکته مهم

در این مخزن یک اسکریپت کمکی هم وجود دارد که برای اجرای سریع‌تر طراحی شده است، اما این اسکریپت هنوز برای.MongoDB از Docker استفاده می‌کند. برای اجرای کاملاً بدون Docker، روش بالا مناسب‌تر است.
