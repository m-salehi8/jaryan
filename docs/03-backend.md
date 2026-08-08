# ۳. مستندات Backend

## ساختار کلی

Backend اخیراً به **Django + Django REST Framework** مهاجرت کرده است و از یک معماری **هیبریدی (PostgreSQL + MongoDB)** استفاده می‌کند. منطق تجاری سیستم در یک app به نام `core` مجتمع شده است.

---

## فایل‌های اصلی

### تنظیمات و نقطه ورود (Django)

نقطه ورود اصلی سرور `manage.py` (برای توسعه و دستورات) و `jaryan/wsgi.py` (برای استقرار با Gunicorn) است. تنظیمات در `jaryan/settings.py` قرار دارد.
تغییرات ساختاری در جنگو اعمال شده که برای مثال `APPEND_SLASH = False` جهت تطابق با کلاینت فعلی در نظر گرفته شده است.

#### Celery و زمان‌بندی (Cron Scheduler)

به جای حلقه `asyncio`، سیستم از **Celery Beat** برای کارهای دوره‌ای استفاده می‌کند:

تنظیمات در `settings.py`:
```python
CELERY_BEAT_SCHEDULE = {
    'check-timeouts-every-minute': {
        'task': 'core.tasks.check_timeouts_task',
        'schedule': crontab(minute='*'),
    },
}
```
این task هر دقیقه برای بررسی timeout‌ها و workflow‌های زمان‌بندی‌شده اجرا می‌شود.

---

### `engine.py` — موتور فرایند

هسته اصلی اجرای فرایند. مستندات کامل در [07-workflow-engine.md](./07-workflow-engine.md).

**توابع اصلی:**

| تابع | امضا | کاربرد |
|------|------|--------|
| `evaluate_rule` | `(rule, context) -> bool` | ارزیابی شرط لبه |
| `advance_process` | `(process_id, completed_node_id, context_update) -> dict` | پیشروی فرایند |
| `check_timeouts` | `() -> None` | مدیریت timeout تسک‌ها |
| `simulate_workflow` | `(workflow, mock_context) -> list[trace]` | شبیه‌سازی بدون DB |
| `inject_variables` | `(text, context) -> str` | جایگزینی `{{var}}` در متن |

---

### `models.py` — مدل‌های داده (Django ORM)

مستندات کامل در [06-data-models.md](./06-data-models.md).

مدل‌های پایه با استفاده از ORM جنگو تعریف شده‌اند و قابلیت‌های **Multi-Tenancy** به صورت درونی تعبیه شده است:

```python
class TenantBaseModel(models.Model):
    id = models.CharField(primary_key=True, default=uuid.uuid4, max_length=100)
    org = models.ForeignKey(Organization, on_delete=models.CASCADE, ...)
    
    objects = TenantManager() # فیلتر خودکار بر اساس org_id کارنت

    class Meta:
        abstract = True
```
علاوه بر مدل‌های جنگو، مدل‌های مبتنی بر MongoDB (با استفاده از Pydantic/Motor) نیز همچنان در `engine.py` یا فایل‌های اختصاصی وجود دارند تا به عنوان **ProcessInstance** و اسناد لاگ کار کنند.

---

### `auth.py` — احراز هویت سفارشی

مستندات کامل در [09-auth.md](./09-auth.md).

با مهاجرت به جنگو، احراز هویت بر مبنای `BaseAuthentication` جنگو (در قالب یک سیستم JWT سفارشی برای سازگاری با سیستم‌های قبلی) تغییر پیدا کرده است:

```python
# در تنظیمات REST_FRAMEWORK
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "core.auth.JWTAuthentication",
    ],
}
```
کاربر جاری (`current_user`) و `current_org_id` در سطح Middleware نیز استخراج و نگهداری می‌شوند.

---

### `db.py` — اتصال پایگاه داده

```python
_mongo_url = os.environ["MONGO_URL"]
_db_name = os.environ["DB_NAME"]

client: AsyncIOMotorClient = AsyncIOMotorClient(_mongo_url)
db: AsyncIOMotorDatabase = client[_db_name]

def new_id() -> str     # UUID4 string
def now_iso() -> str    # ISO datetime string (UTC)
```

**Collections قابل دسترس:**
- `db.organizations`
- `db.users`
- `db.departments`
- `db.workflows`
- `db.forms`
- `db.process_instances`
- `db.tasks`
- `db.comments`
- `db.activities`
- `db.chat_messages`

---

### `seed.py` — داده‌های اولیه

داده‌های اولیه که در هر بار startup بارگذاری می‌شوند (اگر از قبل وجود نداشته باشند):

```python
async def seed() -> dict:
    # اگر organization وجود داشت skip کن
    if await db.organizations.count_documents({}) > 0:
        return {"skipped": True}
    
    # ایجاد سازمان نمونه
    # ایجاد 4 کاربر (admin, designer, manager, employee)
    # ایجاد 2 workflow (مرخصی + تنخواه)
    # ایجاد 2 فرم
    # ایجاد تسک‌های نمونه
    # ایجاد activity logs
```

---

### `services/ai_service.py` — سرویس هوش مصنوعی

مستندات کامل در [08-ai-integration.md](./08-ai-integration.md).

```python
class AIService:
    # متغیرهای محیطی:
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    base_url = os.environ.get("OPENAI_BASE_URL", "http://localhost:20128/v1")
    model = os.environ.get("OPENAI_MODEL", "cf/@cf/moonshotai/kimi-k2.5")
    
    # متدها:
    async def stream_workflow_generation(session_id, message) -> AsyncGenerator
    async def ask_ai_json(session_id, system_prompt, user_message) -> dict
    async def extract_data_from_image(image_data, prompt) -> dict
    def extract_json_block(text) -> dict
```

---

## متغیرهای محیطی Backend

| متغیر | الزامی | پیش‌فرض | توضیح |
|-------|--------|---------|-------|
| `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME` | ✅ | — | تنظیمات اتصال به PostgreSQL |
| `MONGO_URL` | ✅ | — | آدرس MongoDB |
| `MONGO_DB_NAME` | ✅ | — | نام دیتابیس MongoDB |
| `REDIS_URL` | ✅ | `redis://localhost:6379/0` | اتصال Celery/Broker |
| `SECRET_KEY` | ✅ | — | کلید امنیتی Django / JWT |
| `EMERGENT_LLM_KEY` | ✅ | — | کلید API هوش مصنوعی |
| `CORS_ALLOW_ALL_ORIGINS` | ❌ | `True` | کنترل CORS در Django |

---

## مدیریت خطا

### HTTP Status Codes

| کد | معنا | مثال |
|----|------|------|
| 200 | موفق | دریافت/بروزرسانی موفق |
| 400 | درخواست نادرست | `cannot_delete_self` |
| 401 | احراز هویت نشده | `missing_token`, `invalid_token` |
| 403 | دسترسی کافی نیست | `insufficient_permissions` |
| 404 | یافت نشد | `workflow_not_found` |
| 409 | تعارض | `email_already_exists` |
| 422 | اعتبارسنجی ناموفق | فیلد الزامی وجود ندارد |
| 500 | خطای سرور | خطاهای پیش‌بینی نشده |

### Error Response Format
```json
{
    "detail": "error_code_or_message"
}
```

---

## Dockerfile Backend

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# اجرای Gunicorn با WSGI جنگو
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "jaryan.wsgi:application"]
```

---

## لاگ‌گذاری (Logging)

```python
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("jaryan")

# در engine.py
logger = logging.getLogger("jaryan.engine")

# در ai_service.py  
logger = logging.getLogger("jaryan.ai")
```

فرمت لاگ: `INFO:jaryan:seed: {'skipped': True}`
