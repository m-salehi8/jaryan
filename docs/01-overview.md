# ۱. معرفی کلی پروژه جریان (Jaryan)

## چیست؟

**جریان (Jaryan)** یک پلتفرم SaaS اتوماسیون فرایند سازمانی (BPA - Business Process Automation) است که از ابتدا برای بازار ایران طراحی شده. هدف اصلی آن، توانمند کردن سازمان‌های ایرانی برای طراحی، اجرا، و نظارت بر فرایندهای کاری‌شان بدون نیاز به کدنویسی است.

---

## مشکلی که جریان حل می‌کند

سازمان‌های ایرانی برای مدیریت فرایندهایی مثل تایید مرخصی، درخواست تنخواه، آنبوردینگ کارکنان، و... معمولاً از:
- ایمیل و واتساپ گروهی
- فرم‌های کاغذی
- نرم‌افزارهای غیرفارسی که با بازار ایران تطابق ندارند

استفاده می‌کنند. جریان این مشکل را با یک ابزار بصری فارسی‌اول، یکپارچه با هوش مصنوعی، حل می‌کند.

---

## اهداف محصول

| هدف | توضیح |
|-----|-------|
| **No-Code** | کاربران بدون دانش فنی بتوانند فرایند بسازند |
| **فارسی‌اول** | UI، تقویم شمسی، و اعداد فارسی |
| **AI-First** | ساخت فرایند با توصیف متنی فارسی |
| **Multi-Tenant** | هر سازمان داده‌های مجزای خود را دارد |
| **Mobile-Ready** | تایید تسک‌ها از موبایل |

---

## Stack فناوری

### Backend
| فناوری | نسخه | کاربرد |
|--------|-------|--------|
| Python | 3.10+ | زبان اصلی |
| Django | 6.0+ | فریم‌ورک وب (هسته اصلی) |
| Django REST Framework | 3.15+ | فریم‌ورک API |
| PostgreSQL | 15+ | پایگاه داده رابطه‌ای (مدل‌های پایه) |
| MongoDB | 7.0 | پایگاه داده اسنادی (فرایندها) |
| Celery + Redis | 5.3+ | زمان‌بندی و Background Tasks |
| PyJWT | 2.10+ | احراز هویت JWT |
| jdatetime | 4.1+ | تبدیل تاریخ شمسی |
| Tenacity | 8.3+ | Retry logic برای AI |
| Gunicorn | 21.0+ | WSGI Server |

### Frontend
| فناوری | نسخه | کاربرد |
|--------|-------|--------|
| React | 19.0.0 | فریم‌ورک UI |
| ReactFlow | 11.11+ | Visual Workflow Builder |
| Recharts | 3.6.0 | نمودارها |
| Tailwind CSS | 3.4.17 | استایل‌دهی |
| Shadcn/UI + Radix | — | کامپوننت‌های UI |
| Framer Motion | 11.18.0 | انیمیشن‌ها |
| Axios | 1.16.0 | HTTP Client |
| moment-jalaali | 0.10.4 | تقویم شمسی |
| React Router DOM | 7.15.0 | Routing |
| Lucide React | 0.516.0 | آیکون‌ها |
| CRACO | 7.1.0 | Build configuration |

### Infrastructure
| فناوری | کاربرد |
|--------|--------|
| Docker + Docker Compose | Container orchestration |
| Nginx | Reverse proxy + Static serving |
| MongoDB Volume | ماندگاری داده |

---

## نقشه راه (Roadmap)

### MVP اولیه (پیاده‌سازی شده ✅)
- Auth + JWT
- CRUD کامل Workflows، Forms، Tasks
- موتور اجرای فرایند با منطق شرطی
- داشبورد
- AI Chat-to-Workflow (SSE Streaming)
- Inbox تسک‌ها
- Process Monitoring

### Iteration 2 (پیاده‌سازی شده ✅)
- Analytics پیشرفته با نمودارهای شمسی
- مدیریت کاربران سازمان
- Badge نوتیفیکیشن
- کتابخانه تمپلیت‌ها
- هشدارهای SLA
- Command Palette (جستجوی سراسری)
- AI Agent Nodes در فرایند
- OCR Node با Vision API
- Workflow Simulation
- Org Chart
- ساخت Cron Workflow خودکار

### Backlog آینده
- WebSocket real-time
- اعلان‌های ایمیل
- داشبورد موبایل اختصاصی
- API Public برای اتصال به سرویس‌های خارجی
- Single Sign-On (SSO)

---

## پرسوناهای کاربری

| نقش (فارسی) | نقش (انگلیسی) | دسترسی‌ها |
|------------|--------------|-----------|
| ادمین سازمان | Org Admin | همه چیز — مدیریت کاربران، طراحی فرایند، مشاهده analytics |
| طراح فرایند | Process Designer | طراحی workflow و form، مشاهده monitoring |
| مدیر تیم | Team Manager | تایید تسک‌ها، مشاهده گزارش |
| کارمند | Employee | تکمیل تسک‌ها، مشاهده وضعیت |
