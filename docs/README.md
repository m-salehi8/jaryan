# 📚 مستندات پلتفرم جریان (Jaryan)

> پلتفرم هوشمند اتوماسیون فرایند سازمانی — فارسی‌اول، AI-First

---

## فهرست مستندات

| مستند | توضیح |
|-------|-------|
| [01-overview.md](./01-overview.md) | معرفی کلی، معماری و اهداف پروژه |
| [02-architecture.md](./02-architecture.md) | معماری فنی، سرویس‌ها و ارتباط بین اجزا |
| [03-backend.md](./03-backend.md) | مستندات کامل Backend (Django + MongoDB) |
| [04-api-reference.md](./04-api-reference.md) | مرجع کامل API Endpoints |
| [05-frontend.md](./05-frontend.md) | مستندات Frontend (React) |
| [06-data-models.md](./06-data-models.md) | مدل‌های داده و Schema پایگاه داده |
| [07-workflow-engine.md](./07-workflow-engine.md) | موتور اجرای فرایند و منطق Engine |
| [08-ai-integration.md](./08-ai-integration.md) | یکپارچه‌سازی هوش مصنوعی |
| [09-auth.md](./09-auth.md) | احراز هویت، نقش‌ها و مجوزها |
| [10-deployment.md](./10-deployment.md) | راهنمای استقرار (Docker و بدون Docker) |
| [11-development.md](./11-development.md) | راهنمای توسعه محلی |
| [12-testing.md](./12-testing.md) | راهنمای تست‌نویسی |
| [13-features.md](./13-features.md) | مستندات قابلیت‌ها و فیچرها |
| [14-seed-data.md](./14-seed-data.md) | داده‌های اولیه و حساب‌های پیش‌فرض |
| [15-glossary.md](./15-glossary.md) | واژه‌نامه و اصطلاحات |
| [16-hybrid-db-patterns.md](./16-hybrid-db-patterns.md) | الگوهای معماری دیتابیس هیبریدی |
| [17-background-tasks.md](./17-background-tasks.md) | پردازش‌های پس‌زمینه (Celery و Redis) |
| [18-admin-panel.md](./18-admin-panel.md) | مدیریت سیستم و پنل ادمین جنگو (Unfold) |

---

## شروع سریع

```bash
# اجرا با Docker
git clone <repo-url> chahkaran-main
cd chahkaran-main
cp backend/.env.production backend/.env
# (ویرایش .env با مقادیر واقعی)
docker compose up --build -d
```

پس از اجرا:
- **فرانت‌اند**: http://localhost
- **Backend API**: http://localhost:8000/api/
- **حساب ادمین**: `admin@jaryan.ir` / `admin1234`

---

## درباره پروژه

**جریان** (Jaryan) یک پلتفرم B2B اتوماسیون فرایند سازمانی است که برای بازار ایران طراحی شده است. این پلتفرم به سازمان‌های ایرانی امکان می‌دهد فرایندهای کاری خود را بدون نیاز به کد، با استفاده از یک محیط بصری drag-and-drop طراحی، اجرا و نظارت کنند.

### ویژگی‌های کلیدی

- 🇮🇷 **فارسی‌اول**: رابط کاربری کاملاً فارسی و RTL با تقویم شمسی
- 🤖 **AI-First**: ساخت فرایند با دستور زبان طبیعی فارسی
- 🔄 **Visual Workflow Builder**: طراح بصری drag-and-drop با ReactFlow
- 📋 **Form Builder**: ساخت فرم‌های پویا با منطق شرطی
- 📊 **Analytics**: داشبورد تحلیلی با نمودارهای شمسی
- 📱 **Mobile-Ready**: تایید و رد تسک‌ها از موبایل
- 🏢 **Multi-Tenant**: ایزولاسیون کامل داده بین سازمان‌ها
