# ۱۶. الگوهای معماری هیبریدی (Django + MongoDB)

با توجه به اینکه جریان از معماری دیتابیس هیبریدی (PostgreSQL برای داده‌های ساختاریافته از طریق Django ORM و MongoDB برای داده‌های منعطف و حجیم مانند لاگ‌ها و Workflow Instances) استفاده می‌کند، رعایت الگوهای زیر در توسعه ضروری است.

## چه داده‌ای کجا ذخیره می‌شود؟

| نوع دیتابیس | کاربرد اصلی | مثال از مدل‌ها |
|-------------|-------------|----------------|
| **PostgreSQL (Django ORM)** | موجودیت‌های اصلی سیستم که روابط مشخص دارند و ساختار آن‌ها کمتر تغییر می‌کند. | `User`, `Organization`, `Department`, `Workflow`, `Form`, `Task` |
| **MongoDB** | داده‌های مبتنی بر سند (Document) که ساختار منعطف (JSON-like) دارند یا حجم آن‌ها بسیار زیاد است. | `ProcessInstance` (اجرای فرایند), `ActivityLog`, `ChatMessage` |

## اتصال به MongoDB در کنار Django

اتصال به MongoDB توسط درایورهای `motor` یا `pymongo` به صورت مستقل از ORM جنگو در فایل‌های تنظیمات (مثل `core/mongo.py` یا `core/db.py`) برقرار می‌شود.

### مثال استفاده از MongoDB در برنامه‌های جنگو
```python
from core.mongo import get_db

async def my_service_function(process_id):
    db = get_db()
    # استفاده مستقیم از درایور
    process = await db.process_instances.find_one({"id": process_id})
    return process
```

## مدیریت تراکنش‌ها (Transactions)

از آنجایی که PostgreSQL و MongoDB دو سیستم مجزا هستند، **تراکنش‌های توزیع‌شده (Distributed Transactions)** به صورت پیش‌فرض پشتیبانی نمی‌شوند.

### راهکارهای پیشنهادی
1. **ترتیب عملیات:** همیشه ابتدا داده‌ها را در دیتابیس رابطه‌ای (PostgreSQL) ذخیره کنید (جایی که تراکنش‌ها ACID هستند). پس از موفقیت کامل، تغییرات را در MongoDB اعمال کنید.
2. **تسک‌های جبرانی (Compensating Actions):** در صورت شکست عملیات در MongoDB، عملیات انجام شده روی PostgreSQL را رول‌بک (Rollback) یا به صورت دستی لغو کنید.
3. **استفاده از Celery:** کارهایی که نیاز به سینک کردن بین دو دیتابیس دارند را می‌توان از طریق تسک‌های پس‌زمینه با قابلیت Retry پیاده‌سازی کرد.

## قابلیت Multi-Tenancy

در دیتابیس رابطه‌ای، این کار از طریق ارث‌بری از `TenantBaseModel` و `TenantManager` انجام شده است که با استفاده از Middleware سازمان فعلی کاربر را تشخیص داده و کوئری‌ها را به صورت خودکار فیلتر می‌کند.

در دیتابیس MongoDB، این فیلتر به صورت خودکار اعمال **نمی‌شود** و شما باید به صراحت `org_id` را در تمام کوئری‌های خود لحاظ کنید:
```python
# در MongoDB (همیشه org_id را در کوئری ارسال کنید)
db.process_instances.find({"org_id": request.user.org_id, "status": "running"})
```
