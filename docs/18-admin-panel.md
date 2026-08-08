# ۱۸. پنل ادمین (Django Unfold)

با مهاجرت به Django، پروژه جریان اکنون از پنل مدیریتی قدرتمند و زیبای جنگو بهره‌مند شده است که با استفاده از تم **Unfold** رابط کاربری مدرنی را ارائه می‌دهد.

## دسترسی به پنل ادمین

- **آدرس:** `/admin/`
- **ورود:** با استفاده از حساب کاربری `superuser` که نقش ادمین سیستم را دارد.

برای ایجاد یک حساب ادمین جدید در خط فرمان:
```bash
python manage.py createsuperuser
```

## تم Unfold

این تم به ادمین پنل استاندارد جنگو قابلیت‌های زیر را اضافه می‌کند:
- پشتیبانی بومی از Tailwind CSS
- حالت تاریک (Dark Mode)
- قابلیت سفارشی‌سازی داشبورد با Callback‌های سفارشی
- نمایش بهتر فیلترها و فرم‌های رابطه‌ای

## پیکربندی مدل‌ها در ادمین

برای نمایش مدل‌های خود در ادمین پنل با ظاهر Unfold، باید از کلاس `ModelAdmin` متعلق به Unfold ارث‌بری کنید:

```python
# در فایل core/admin.py
from django.contrib import admin
from unfold.admin import ModelAdmin
from .models import Workflow

@admin.register(Workflow)
class WorkflowAdmin(ModelAdmin):
    list_display = ("name", "status", "trigger_type", "created_by")
    search_fields = ("name",)
    list_filter = ("status", "trigger_type")
```

## داشبورد سفارشی

همانطور که در `settings.py` مشاهده می‌شود، داشبورد اختصاصی برای پروژه تنظیم شده است:
```python
UNFOLD = {
    "DASHBOARD_CALLBACK": "core.utils.dashboard_callback",
}
```
این تابع می‌تواند آمارها و ویجت‌های اختصاصی (مانند تعداد Workflow‌های ثبت شده یا نمودارهای آماری پایه‌ای) را برای کاربر ادمین به نمایش بگذارد.

## تفاوت پنل ادمین جنگو با پنل ادمین سازمان

> **مهم:** پنل مدیریت جنگو (`/admin/`) برای **تیم پشتیبانی و مدیران کل سیستم (Superusers)** است تا به تمامی داده‌های همه سازمان‌ها دسترسی نظارتی داشته باشند.
> پنلی که در محیط React (در آدرس `/admin` فرانت‌اند) توسعه داده شده، مخصوص **مدیر هر سازمان (Org Admin)** است تا صرفاً کاربران و فرایندهای سازمان خودش را مدیریت کند.
