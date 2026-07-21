# ۲. معماری فنی

## نمای کلی معماری

```
                    ┌─────────────────────────────────────┐
                    │              Browser                 │
                    │    React SPA (RTL / Persian-first)   │
                    └──────────────┬──────────────────────┘
                                   │ HTTP / SSE
                    ┌──────────────▼──────────────────────┐
                    │     Nginx  (port 80)                 │
                    │  ┌──────────────────────────────┐   │
                    │  │  /api/* → proxy backend:8000 │   │
                    │  │  /*     → serve React build  │   │
                    │  └──────────────────────────────┘   │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │    FastAPI + Uvicorn  (port 8000)    │
                    │                                      │
                    │  ┌────────┐  ┌────────┐  ┌───────┐  │
                    │  │ server │  │ engine │  │  auth │  │
                    │  └───┬────┘  └───┬────┘  └───────┘  │
                    │      │          │                    │
                    │  ┌───▼──────────▼──────────────┐     │
                    │  │  services/                   │     │
                    │  │   ├── ai_service.py          │     │
                    │  │   └── prompts.py             │     │
                    │  └──────────────────────────────┘     │
                    └──────────────┬──────────────────────┘
                                   │ Motor (async)
                    ┌──────────────▼──────────────────────┐
                    │         MongoDB 7.0                  │
                    │                                      │
                    │  Collections:                        │
                    │  ├── organizations                   │
                    │  ├── users                           │
                    │  ├── departments                     │
                    │  ├── workflows                       │
                    │  ├── forms                           │
                    │  ├── process_instances               │
                    │  ├── tasks                           │
                    │  ├── comments                        │
                    │  ├── activities                      │
                    │  └── chat_messages                   │
                    └──────────────────────────────────────┘
                                   ▲
                    ┌──────────────┴──────────────────────┐
                    │       AI Provider (LLM)              │
                    │  emergentintegrations / OpenAI-compat│
                    │  Model: kimi-k2.5 (configurable)     │
                    └──────────────────────────────────────┘
```

---

## جریان داده (Data Flow)

### ۱. احراز هویت
```
Browser → POST /api/auth/login
       ← { token: JWT, user: {...} }
Browser → localStorage.setItem("jaryan_token", token)
Browser → هر request بعدی: Authorization: Bearer <token>
```

### ۲. اجرای یک فرایند
```
User → POST /api/workflows/{id}/start
     ← process_instance ایجاد می‌شود
     ← advance_process() اجرا می‌شود
     ← اولین task به assignee اختصاص می‌یابد
Assignee → GET /api/tasks?assigned_to_me=true
         → PATCH /api/tasks/{id} (status: approved/done)
         ← advance_process() به node بعدی می‌رود
```

### ۳. AI Workflow Generation
```
User → POST /api/ai/generate-workflow (SSE)
     ← stream: TextDelta chunks
     ← event: done (JSON workflow)
User → POST /api/workflows (ذخیره workflow تولید شده)
     → /admin/workflows/{id} (باز کردن در builder)
```

### ۴. Cron Scheduler
```
Startup → asyncio.create_task(cron_scheduler())
Loop (هر ۶۰ ثانیه):
  → db.workflows.find({trigger_type: "cron", status: "published"})
  → croniter.match(expr, now)
  → ProcessInstance ایجاد → advance_process()
  → check_timeouts() برای task‌های منقضی‌شده
```

---

## ساختار کامل فایل‌ها

```
chahkaran-main/
│
├── backend/                          ← سرویس Backend (FastAPI)
│   ├── server.py                     ← نقطه ورود، تمام Routes
│   ├── engine.py                     ← موتور اجرای فرایند
│   ├── models.py                     ← مدل‌های Pydantic
│   ├── auth.py                       ← JWT احراز هویت
│   ├── db.py                         ← اتصال MongoDB
│   ├── seed.py                       ← داده‌های اولیه
│   ├── seed_heavy.py                 ← داده‌های نمونه انبوه
│   ├── seed_ai_workflow.py           ← workflow نمونه با AI Node
│   ├── test_cron.py                  ← تست cron scheduler
│   ├── requirements.txt              ← وابستگی‌های Python
│   ├── Dockerfile                    ← Docker image بک‌اند
│   ├── .env                          ← متغیرهای محیطی (local)
│   ├── .env.production               ← نمونه production
│   ├── services/
│   │   ├── ai_service.py             ← سرویس LLM
│   │   └── prompts.py                ← Prompt‌های ثابت
│   └── tests/
│       ├── conftest.py               ← تنظیمات pytest
│       └── backend_test.py           ← تست‌های API
│
├── frontend/                         ← سرویس Frontend (React)
│   ├── src/
│   │   ├── App.js                    ← Routing اصلی
│   │   ├── index.js                  ← Entry point
│   │   ├── App.css                   ← استایل سراسری
│   │   ├── index.css                 ← استایل‌های پایه + Tailwind
│   │   │
│   │   ├── pages/                    ← صفحات
│   │   │   ├── Login.js              ← صفحه ورود
│   │   │   ├── Dashboard.js          ← داشبورد اصلی
│   │   │   ├── Chat.js               ← AI Chat-to-Workflow
│   │   │   ├── WorkflowsList.js      ← لیست فرایندها
│   │   │   ├── WorkflowBuilder.js    ← ویرایشگر بصری فرایند (ReactFlow)
│   │   │   ├── SimpleWorkflowBuilder.js ← ویرایشگر ساده
│   │   │   ├── FormsList.js          ← لیست فرم‌ها
│   │   │   ├── FormBuilder.js        ← ویرایشگر فرم
│   │   │   ├── Inbox.js              ← کارتابل تسک‌ها
│   │   │   ├── ProcessMonitoring.js  ← نظارت بر فرایندها
│   │   │   ├── Analytics.js          ← داشبورد آنالیتیکس
│   │   │   ├── UserManagement.js     ← مدیریت کاربران
│   │   │   ├── OrgChart.js           ← نمودار سازمانی
│   │   │   └── MobileApprovals.js    ← تایید موبایل
│   │   │
│   │   ├── components/               ← کامپوننت‌های مشترک
│   │   │   ├── Layout.js             ← Layout کاربر عادی
│   │   │   ├── AdminLayout.js        ← Layout ادمین
│   │   │   ├── AdminRoute.js         ← Route Guard ادمین
│   │   │   ├── FormRenderer.js       ← نمایش و ارسال فرم‌ها
│   │   │   ├── CommandPalette.js     ← جستجوی سراسری (Ctrl+K)
│   │   │   ├── TemplateLibraryModal.js ← کتابخانه تمپلیت
│   │   │   ├── ProcessTimeline.js    ← timeline فرایند
│   │   │   ├── JalaliDatePicker.js   ← انتخابگر تاریخ شمسی
│   │   │   ├── AIAgentNode.js        ← node کاستوم AI
│   │   │   ├── OCRNode.js            ← node کاستوم OCR
│   │   │   ├── onboarding/           ← کامپوننت‌های آموزش اولیه
│   │   │   └── ui/                   ← کامپوننت‌های Shadcn/UI
│   │   │
│   │   ├── lib/                      ← ابزارهای کمکی
│   │   │   ├── api.js                ← Axios client + AI streaming
│   │   │   ├── auth.js               ← AuthContext
│   │   │   ├── badgeContext.js       ← Badge نوتیفیکیشن
│   │   │   ├── themeContext.js       ← Theme (dark/light)
│   │   │   ├── uiContext.js          ← UI state global
│   │   │   ├── formLogic.js          ← منطق فرم‌های شرطی
│   │   │   ├── jalali.js             ← تبدیل تاریخ شمسی
│   │   │   ├── sla.js                ← محاسبه SLA
│   │   │   ├── templates.js          ← تمپلیت‌های فرایند
│   │   │   └── utils.js              ← ابزارهای عمومی
│   │   │
│   │   ├── hooks/                    ← Custom Hooks
│   │   │   ├── use-toast.js          ← Toast notifications
│   │   │   ├── useFormValidation.js  ← اعتبارسنجی فرم
│   │   │   └── useOnboarding.js      ← آموزش اولیه
│   │   │
│   │   └── constants/                ← ثابت‌ها
│   │
│   ├── public/
│   │   └── index.html                ← HTML اصلی (Vazirmatn font)
│   ├── package.json                  ← وابستگی‌های npm
│   ├── tailwind.config.js            ← تنظیمات Tailwind
│   ├── craco.config.js               ← build config
│   ├── nginx.conf                    ← تنظیمات Nginx
│   └── Dockerfile                    ← Docker multi-stage build
│
├── docker-compose.yml                ← Orchestration اصلی
├── docker-compose.dev.yml            ← Config توسعه
├── DEPLOY.md                         ← راهنمای استقرار با Docker
├── RUN_WITHOUT_DOCKER.md             ← راهنمای اجرا بدون Docker
├── design_guidelines.json           ← دستورالعمل طراحی UI
├── memory/
│   └── PRD.md                        ← Product Requirements Document
├── plan/
│   ├── requirements.md               ← نیازمندی‌های دقیق فیچرها
│   ├── design.md                     ← طراحی UI
│   └── tasks.md                      ← Task list
└── scripts/
    └── dev.sh                        ← اسکریپت اجرای سریع
```

---

## Multi-Tenancy

هر resource در سیستم یک فیلد `org_id` دارد که تضمین می‌کند داده‌های هر سازمان از بقیه جداست:

```python
# هر query به این شکل فیلتر می‌شود:
db.workflows.find({"org_id": user.org_id})
db.tasks.find({"org_id": user.org_id, ...})
```

`org_id` از JWT توکن کاربر خوانده می‌شود و در هیچ جایی از کاربر گرفته نمی‌شود.

---

## الگوهای طراحی مهم

### 1. Workflow Snapshot
وقتی یک فرایند شروع می‌شود، snapshot فعلی nodes و edges ذخیره می‌شود تا تغییرات بعدی workflow تاثیری روی فرایندهای در حال اجرا نگذارد:

```python
instance = ProcessInstance(
    workflow_snapshot={"nodes": wf["nodes"], "edges": wf["edges"]}
)
```

### 2. Context Propagation
داده‌های فرم‌های تکمیل‌شده در `process_instance.context` تجمیع می‌شوند و در شروط لبه‌ها قابل استفاده‌اند:

```python
ctx = dict(process["context"])
ctx.update(form_submission_data)
evaluate_rule(edge["condition"], ctx)
```

### 3. SSE Streaming
پاسخ AI به صورت Server-Sent Events ارسال می‌شود:

```python
async def event_gen():
    async for chunk in ai_service.stream_workflow_generation(...):
        yield f"data: {chunk}\n\n"
    yield f"event: done\ndata: {json_workflow}\n\n"
```
