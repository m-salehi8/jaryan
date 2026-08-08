# ۱۷. پردازش‌های پس‌زمینه (Celery)

برای اجرای کارهایی که زمان‌بر هستند یا باید در زمان‌های خاص (Cron) اجرا شوند، از ترکیب **Celery** و **Redis** استفاده شده است.

## پیکربندی

Celery به عنوان یک سرویس مجزا در `docker-compose.yml` اجرا می‌شود و تنظیمات آن در `jaryan/settings.py` قرار دارد:

```python
CELERY_BROKER_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
```

## اجرای Workerها

در محیط توسعه (بدون Docker) می‌توانید Worker را با دستور زیر اجرا کنید:
```bash
celery -A jaryan worker -l INFO
```

## تعریف یک Task جدید

تسک‌ها در فایل `tasks.py` درون هر اپلیکیشن (مانند `core/tasks.py`) تعریف می‌شوند:

```python
from celery import shared_task

@shared_task
def process_heavy_data(data_id: str):
    # این کد در پس‌زمینه اجرا می‌شود
    pass
```

## زمان‌بندی Taskها (Cron Jobs)

برای اجرای تسک‌ها در زمان‌های خاص (مثلاً هر یک دقیقه)، از `Celery Beat` استفاده می‌شود:

در تنظیمات (`settings.py`):
```python
from celery.schedules import crontab

CELERY_BEAT_SCHEDULE = {
    'check-timeouts-every-minute': {
        'task': 'core.tasks.check_timeouts_task',
        'schedule': crontab(minute='*'), # هر دقیقه
    },
}
```

برای فعال‌سازی زمان‌بند در محیط توسعه:
```bash
celery -A jaryan beat -l INFO
```

## موارد استفاده رایج در جریان
1. **بررسی Timeout تسک‌ها:** بررسی و ارجاع/لغو خودکار تسک‌هایی که مهلت انجام آن‌ها تمام شده است.
2. **فرایندهای زمان‌بندی شده (Cron Workflows):** شروع نمونه‌فرایند (Process Instance) برای فرایندهایی که تریگر دوره‌ای دارند.
3. **ارسال ایمیل یا نوتیفیکیشن:** (در فازهای بعدی)
