# اجرای پروژه جریان بدون Docker

این راهنما بک‌اند **Django/DRF** را اجرا می‌کند — همان چیزی که فرانت‌اند واقعاً با آن حرف می‌زند.

> بک‌اند FastAPI (`backend/server.py`، `auth.py`، `db.py`، `models.py`، `seed.py`) کد قدیمی و
> غیرفعال است و در هیچ مسیری سرو نمی‌شود. آن را اجرا نکنید.

## راه سریع: `run.sh`

اسکریپت `run.sh` همه‌ی مراحل زیر را خودکار انجام می‌دهد — venv، نصب پکیج‌ها، مایگریشن،
seed، و بالا آوردن هر دو سرور با هم:

```bash
chmod +x run.sh && ./run.sh
```

بار اول چند دقیقه طول می‌کشد (نصب `node_modules`). دفعات بعد مستقیم اجرا می‌شود.
`Ctrl-C` هر دو سرور را می‌بندد.

| دستور | کار |
|---|---|
| `./run.sh` | نصب در صورت نیاز + اجرای بک‌اند و فرانت‌اند |
| `./run.sh setup` | فقط نصب و آماده‌سازی دیتابیس |
| `./run.sh backend` | فقط بک‌اند |
| `./run.sh frontend` | فقط فرانت‌اند |
| `./run.sh seed` | ساخت مجدد داده‌ی نمونه از صفر |
| `./run.sh celery` | ورکر و beat سلری |
| `./run.sh status` | بررسی venv، دیتابیس، سرویس‌ها و پورت‌ها |
| `./run.sh clean` | حذف venv و `node_modules` و `db.sqlite3` |

پورت‌ها با متغیر محیطی قابل تغییرند: `BACKEND_PORT=8001 FRONTEND_PORT=3001 ./run.sh`

اگر ترجیح می‌دهی مرحله‌به‌مرحله دستی جلو بروی، ادامه‌ی این سند همان کارها را باز می‌کند.

## سرویس‌های مورد نیاز

| سرویس | کاربرد | بدون آن چه می‌شود |
|---|---|---|
| SQLite | کاربران، فرم‌ها، ورک‌فلوها، تسک‌ها (Django ORM) | — داخل پایتون است، نصب نمی‌خواهد |
| MongoDB | `process_instances` و `activity_logs` | لاگین و لیست‌ها کار می‌کنند، اجرای فرایند نه |
| Redis | بروکر Celery برای بررسی تایم‌اوت تسک‌ها | فقط تایم‌اوت خودکار کار نمی‌کند |

دیتابیس اصلی SQLite است و در `backend/db.sqlite3` ساخته می‌شود. اگر `DB_HOST` در `.env`
ست شود، جنگو به‌جای آن PostgreSQL را انتخاب می‌کند — مسیری که `docker-compose` استفاده می‌کند.

---

## ۱) نصب سرویس‌ها (Ubuntu/Debian)

### MongoDB

```bash
sudo apt-get install -y gnupg curl
curl -fsSL https://pgp.mongodb.com/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME)/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt-get update && sudo apt-get install -y mongodb-org
sudo systemctl enable --now mongod
```

### Redis

```bash
sudo apt-get install -y redis-server
sudo systemctl enable --now redis-server
```

### بررسی سلامت

```bash
mongosh --quiet --eval 'db.adminCommand({ping:1})' && redis-cli ping
```

---

## ۲) بک‌اند

```bash
cd /home/mohammad/projects/jaryan/backend
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements-local.txt
```

> `requirements.txt` کامل شامل `jq`، `pandas`، `numpy`، `boto3` و استک FastAPI است و روی
> ماشین بدون `build-essential` شکست می‌خورد. `requirements-local.txt` دقیقاً همان چیزی است
> که استک جنگو import می‌کند.

فایل `backend/.env` از قبل برای اجرای لوکال تنظیم شده است:

```env
MONGO_URL=mongodb://localhost:27017
MONGO_DB_NAME=jaryan
REDIS_URL=redis://127.0.0.1:6379/0
SECRET_KEY=django-insecure-key
DEBUG=True
```

هیچ متغیر `DB_*` در آن نیست، پس جنگو SQLite را در `backend/db.sqlite3` می‌سازد.

مایگریشن و داده‌ی نمونه:

```bash
cd /home/mohammad/projects/jaryan/backend
source .venv/bin/activate
python manage.py migrate
python manage.py seed
```

`seed` سازمان نمونه، دپارتمان‌ها، چهار کاربر، یک فرم و یک ورک‌فلوی «درخواست مرخصی»
(trigger → form → approval → end) می‌سازد. برای ساخت مجدد از صفر: `python manage.py seed --reset`.

اجرای سرور:

```bash
cd /home/mohammad/projects/jaryan/backend
source .venv/bin/activate
python manage.py runserver 0.0.0.0:8000
```

تست:

```bash
curl -s -X POST http://127.0.0.1:8000/api/auth/login/ -H 'Content-Type: application/json' -d '{"email":"admin@jaryan.ir","password":"admin1234"}'
```

باید یک `token` و آبجکت `user` برگردد.

---

## ۳) فرانت‌اند

Node 18+ لازم است. اگر Node سیستمی نداری، همان آرشیوی که در ریشه‌ی پروژه استخراج کرده‌ای کافی است:

```bash
export PATH="/home/mohammad/projects/jaryan/node/bin:$PATH"
node -v
```

نصب و اجرا:

```bash
cd /home/mohammad/projects/jaryan/frontend
corepack enable
yarn install --network-timeout 600000
yarn start
```

`package.json` مقدار `proxy: http://127.0.0.1:8000` دارد و `api.js` وقتی
`REACT_APP_BACKEND_URL` ست نباشد از `/api` استفاده می‌کند — پس **نیازی به فایل `.env`
در فرانت‌اند نیست**. اپ روی `http://localhost:3000` بالا می‌آید.

---

## ۴) Celery (اختیاری)

فقط برای اجرای خودکار اکشن‌های تایم‌اوت تسک لازم است. در دو ترمینال جدا:

```bash
cd /home/mohammad/projects/jaryan/backend && source .venv/bin/activate && celery -A jaryan worker -l info
```

```bash
cd /home/mohammad/projects/jaryan/backend && source .venv/bin/activate && celery -A jaryan beat -l info
```

---

## حساب‌های پیش‌فرض

| ایمیل | رمز | نقش |
|---|---|---|
| `admin@jaryan.ir` | `admin1234` | مدیر (superuser، دسترسی به `/admin/`) |
| `designer@jaryan.ir` | `1234` | کارمند |
| `manager@jaryan.ir` | `1234` | مدیر |
| `employee@jaryan.ir` | `1234` | کارمند |

پنل ادمین جنگو: `http://127.0.0.1:8000/admin/`

---

## مشکلات رایج

**`no such table: core_user`** — `python manage.py migrate` اجرا نشده است.

**`KeyError: 'DB_NAME'` هنگام بالا آمدن جنگو** — `DB_HOST` ست شده ولی بقیه‌ی متغیرهای
`DB_*` نه. یا هر پنج‌تا را با هم ست کن، یا `DB_HOST` را حذف کن تا SQLite استفاده شود.

**می‌خواهی از صفر شروع کنی** — فایل `backend/db.sqlite3` را حذف کن و دوباره
`migrate` و `seed` بزن.

**`/api/processes/` خطای ۵۰۰ می‌دهد** — MongoDB بالا نیست. `sudo systemctl status mongod`.

**پورت اشغال است** — `python manage.py runserver 0.0.0.0:8001` و در فرانت‌اند
`REACT_APP_BACKEND_URL=http://localhost:8001 yarn start`.

---

## آنچه هنوز پیاده‌سازی نشده

- `POST /api/ai/generate-workflow/` که `frontend/src/lib/api.js` صدا می‌زند در `core/urls.py`
  وجود ندارد → صفحه‌ی چت هوش مصنوعی ۴۰۴ می‌گیرد.
- `analytics/users` و `analytics/forms` آرایه‌ی خالی برمی‌گردانند و `comments` mock است.
- مدل `Task` جنگو فیلدهای `title`، `type`، `priority`، `deadline` و `form_id` را ندارد،
  در حالی که موتور فرایند آن‌ها را می‌سازد — این مقادیر ذخیره نمی‌شوند.
- `check_timeouts` به‌جای `timeout_seconds` تعریف‌شده روی نودها، مهلت ۳ روزه‌ی ثابت دارد.
