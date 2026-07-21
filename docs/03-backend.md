# ۳. مستندات Backend

## ساختار کلی

Backend با **FastAPI** نوشته شده و از معماری تک‌فایلی (`server.py`) با ماژول‌های جداگانه برای منطق تخصصی استفاده می‌کند.

---

## فایل‌های اصلی

### `server.py` — نقطه ورود

تمام Route‌های API در این فایل تعریف شده‌اند. ساختار کلی:

```python
app = FastAPI(title="Jaryan API")
api = APIRouter(prefix="/api")

# --- Lifecycle ---
@app.on_event("startup")    # seed data + cron scheduler
@app.on_event("shutdown")   # بستن MongoDB client

# --- Routes ---
# Auth, Users, Departments, Workflows, Forms,
# Tasks, Processes, Dashboard, Search,
# Analytics, Comments, AI Chat

app.include_router(api)
app.add_middleware(CORSMiddleware, ...)
```

#### Cron Scheduler
یک task پس‌زمینه (asyncio) که هر ۶۰ ثانیه اجرا می‌شود:

```python
async def cron_scheduler():
    while True:
        # پیدا کردن workflow های cron published
        cursor = db.workflows.find({"status": "published", "trigger_type": "cron"})
        async for wf in cursor:
            if croniter.match(wf["cron_expression"], now_dt):
                # ایجاد process instance + اجرا
                await advance_process(...)
        
        # بررسی timeout تسک‌ها
        await check_timeouts()
        
        await asyncio.sleep(60 - now.second)
```

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

### `models.py` — مدل‌های Pydantic

مستندات کامل در [06-data-models.md](./06-data-models.md).

```python
# BaseDocument: پایه همه documents
class BaseDocument(BaseModel):
    id: str = Field(default_factory=new_id)      # UUID4
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)
    
    def to_mongo(self) -> dict   # برای ذخیره در MongoDB
    def from_mongo(cls, doc) -> Self  # برای خواندن از MongoDB
```

---

### `auth.py` — احراز هویت

مستندات کامل در [09-auth.md](./09-auth.md).

```python
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"
JWT_TTL_HOURS = 24 * 14  # 14 روز

def hash_password(plain: str) -> str    # SHA256
def verify_password(plain, hashed) -> bool
def make_token(user_id, org_id) -> str  # JWT
def decode_token(token) -> dict
async def get_current_user(authorization) -> User

# Dependency Injection
CurrentUser = Depends(get_current_user)
```

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
| `MONGO_URL` | ✅ | — | آدرس MongoDB |
| `DB_NAME` | ✅ | — | نام دیتابیس |
| `JWT_SECRET` | ✅ | — | کلید رمزنگاری JWT |
| `EMERGENT_LLM_KEY` | ✅ | — | کلید API هوش مصنوعی |
| `CORS_ORIGINS` | ❌ | `*` | دامنه‌های مجاز CORS |
| `OPENAI_BASE_URL` | ❌ | `http://localhost:20128/v1` | آدرس LLM provider |
| `OPENAI_MODEL` | ❌ | `cf/@cf/moonshotai/kimi-k2.5` | مدل AI |

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
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
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
