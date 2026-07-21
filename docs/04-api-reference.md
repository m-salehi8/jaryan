# ۴. مرجع API

## اطلاعات پایه

- **Base URL**: `/api`
- **Content-Type**: `application/json`
- **احراز هویت**: `Authorization: Bearer <JWT_TOKEN>`
- تمام endpoint‌ها (به جز `/api/auth/login`) نیاز به JWT دارند

---

## Auth

### POST `/api/auth/login`
ورود به سیستم و دریافت JWT token.

**Body:**
```json
{
  "email": "admin@jaryan.ir",
  "password": "admin1234"
}
```

**Response 200:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "user": {
    "id": "uuid",
    "org_id": "uuid",
    "email": "admin@jaryan.ir",
    "full_name": "مدیر سیستم",
    "role": "ادمین سازمان",
    "avatar_color": "#737373",
    "department_id": null,
    "manager_id": null
  }
}
```

**Errors:** `401 invalid_credentials`

---

### GET `/api/auth/me`
دریافت اطلاعات کاربر جاری.

**Response 200:** `UserPublic` object (همان فرمت user در login)

---

## Users

### GET `/api/users`
لیست کاربران سازمان.

**Response 200:** آرایه‌ای از User objects (بدون `password_hash`)

---

### POST `/api/users`
ایجاد کاربر جدید (فقط ادمین سازمان).

**Body:**
```json
{
  "full_name": "نام کامل",
  "email": "user@example.com",
  "role": "کارمند",
  "password": "password123",
  "department_id": "uuid-optional",
  "manager_id": "uuid-optional"
}
```

**Response 200:** UserPublic object  
**Errors:** `403 insufficient_permissions`, `409 email_already_exists`

---

### PATCH `/api/users/{uid}`
بروزرسانی نقش/دپارتمان/مدیر کاربر (فقط ادمین سازمان).

**Body:**
```json
{
  "role": "مدیر تیم",
  "department_id": "uuid",
  "manager_id": "uuid"
}
```

**Response 200:** User object بروز شده  
**Errors:** `403`, `404 user_not_found`

---

### DELETE `/api/users/{uid}`
حذف کاربر (فقط ادمین سازمان).

**Response 200:** `{"deleted": true}`  
**Errors:** `400 cannot_delete_self`, `403`, `404 user_not_found`

---

## Departments

### GET `/api/departments`
لیست دپارتمان‌های سازمان.

**Response 200:**
```json
[
  {
    "id": "uuid",
    "org_id": "uuid",
    "name": "واحد فناوری اطلاعات",
    "parent_id": null,
    "manager_id": "uuid",
    "created_at": "...",
    "updated_at": "..."
  }
]
```

---

### POST `/api/departments`
ایجاد دپارتمان جدید (فقط ادمین).

**Body:**
```json
{
  "name": "واحد منابع انسانی",
  "parent_id": "uuid-optional",
  "manager_id": "uuid-optional"
}
```

---

### PATCH `/api/departments/{did}`
بروزرسانی دپارتمان (فقط ادمین).

---

### DELETE `/api/departments/{did}`
حذف دپارتمان (فقط ادمین). کاربران عضو آن دپارتمان را `null` می‌کند.

---

## Workflows

### GET `/api/workflows`
لیست فرایندهای سازمان (مرتب بر اساس `created_at` نزولی).

**Response 200:** آرایه‌ای از Workflow objects

---

### POST `/api/workflows`
ایجاد فرایند جدید.

**Body:**
```json
{
  "name": "فرایند درخواست مرخصی",
  "description": "توضیح",
  "trigger_type": "manual",
  "cron_expression": null,
  "nodes": [...],
  "edges": [...]
}
```

---

### GET `/api/workflows/{wf_id}`
دریافت یک فرایند.

---

### PATCH `/api/workflows/{wf_id}`
بروزرسانی فرایند.

**Body (partial):**
```json
{
  "name": "نام جدید",
  "status": "published",
  "nodes": [...],
  "edges": [...]
}
```

**مقادیر `status`:** `draft` | `published` | `archived`

---

### DELETE `/api/workflows/{wf_id}`
حذف فرایند.

---

### POST `/api/workflows/{wf_id}/start`
شروع یک instance از فرایند.

**پیش‌نیاز:** فرایند باید `published` باشد.

**Response 200:**
```json
{
  "process": { ProcessInstance },
  "advanced": { "ok": true, "next_tasks": [...], "status": "running" }
}
```

---

### POST `/api/workflows/{wf_id}/simulate`
شبیه‌سازی فرایند بدون ذخیره در دیتابیس.

**Body:**
```json
{
  "mock_context": {
    "amount": "5000000",
    "requester": "Test User"
  }
}
```

**Response 200:**
```json
{
  "traces": [
    {
      "node_id": "n1",
      "time_taken_ms": 50,
      "result": { ... },
      "status": "success",
      "context_snapshot": { ... }
    }
  ]
}
```

---

## Forms

### GET `/api/forms`
لیست فرم‌های سازمان.

---

### POST `/api/forms`
ایجاد فرم جدید.

**Body:**
```json
{
  "name": "فرم درخواست مرخصی",
  "description": "توضیح",
  "fields": [
    {
      "id": "field_uuid",
      "type": "text",
      "label": "نام درخواست‌کننده",
      "required": true,
      "placeholder": "نام کامل",
      "options": [],
      "visible_if": null
    }
  ]
}
```

**انواع field type:** `text`, `textarea`, `number`, `date`, `select`, `checkbox`, `user`, `file`, `heading`, `divider`, `tabs`

---

### GET `/api/forms/{form_id}`
دریافت یک فرم.

---

### PATCH `/api/forms/{form_id}`
بروزرسانی فرم.

---

### DELETE `/api/forms/{form_id}`
حذف فرم.

---

## Tasks

### GET `/api/tasks`
لیست تسک‌های سازمان.

**Query Parameters:**
| پارامتر | نوع | توضیح |
|---------|-----|-------|
| `assigned_to_me` | bool | فقط تسک‌های کاربر جاری |
| `status` | string | فیلتر بر اساس وضعیت |

**وضعیت‌های ممکن:** `waiting`, `pending`, `in_progress`, `approved`, `rejected`, `done`

---

### GET `/api/tasks/{task_id}`
دریافت یک تسک.

---

### PATCH `/api/tasks/{task_id}`
بروزرسانی وضعیت تسک.

**Body:**
```json
{
  "status": "approved",
  "form_data": {
    "field_id_1": "مقدار",
    "field_id_2": "مقدار"
  }
}
```

**منطق:**
- `status: approved/done` → `advance_process()` اجرا می‌شود
- `status: rejected` → فرایند به وضعیت `rejected` می‌رود
- `status: in_progress` → `seen_time` ثبت می‌شود
- `status: done/approved/rejected` → `done_time` ثبت می‌شود

**Response 200:**
```json
{
  "task": { Task },
  "advanced": { "ok": true, "next_tasks": [...] }
}
```

---

### POST `/api/tasks/{task_id}/draft`
ذخیره پیش‌نویس فرم (بدون تغییر status).

**Body:**
```json
{
  "draft_data": { "field_id": "value" }
}
```

---

## Processes

### GET `/api/processes`
لیست process instances سازمان.

---

### GET `/api/processes/{pid}`
دریافت جزئیات کامل یک فرایند.

**Response 200:**
```json
{
  "process": { ProcessInstance },
  "tasks": [ Task, ... ],
  "workflow": { Workflow }
}
```

---

## Dashboard

### GET `/api/dashboard`
داده‌های داشبورد اصلی.

**Response 200:**
```json
{
  "counters": {
    "my_tasks": 5,
    "pending_approvals": 2,
    "running_processes": 3,
    "workflows": 10
  },
  "my_tasks": [ Task, ... ],
  "pending_approvals": [ Task, ... ],
  "running_processes": [ ProcessInstance, ... ],
  "activities": [ ActivityLog, ... ],
  "recommendations": [
    {
      "id": "uuid",
      "icon": "sparkles",
      "title": "...",
      "reason": "..."
    }
  ]
}
```

---

## Analytics

### GET `/api/analytics/dashboard`
داده‌های تحلیلی داشبورد.

**Query Parameters:**
| پارامتر | نوع | توضیح |
|---------|-----|-------|
| `start_date` | ISO string | شروع بازه (پیش‌فرض: ۳۰ روز قبل) |
| `end_date` | ISO string | پایان بازه (پیش‌فرض: الان) |

**Response 200:**
```json
{
  "daily_processes": [
    { "date": "1403-04-01", "count": 5 }
  ],
  "task_status_dist": [
    { "workflow": "نام فرایند", "count": 12 }
  ],
  "top_users": [
    { "user_id": "...", "full_name": "...", "role": "...", "task_count": 8 }
  ],
  "avg_completion_minutes": 145.5
}
```

---

### GET `/api/analytics/users`
آمار عملکرد کاربران.

**Response 200:**
```json
[
  {
    "user_id": "uuid",
    "full_name": "...",
    "role": "کارمند",
    "task_count": 15,
    "avg_lead_time": 32.5
  }
]
```

---

### GET `/api/analytics/workflows/{wf_id}/heatmap`
نقشه گرمایی زمان توقف در هر node.

**Response 200:**
```json
{
  "node_id_1": { "avg_time_minutes": 45.2, "count": 8 },
  "node_id_2": { "avg_time_minutes": 12.1, "count": 8 }
}
```

---

### GET `/api/analytics/forms`
توزیع تعداد فرایندها به تفکیک workflow.

**Response 200:**
```json
[
  { "name": "فرایند مرخصی", "value": 25 }
]
```

---

## Search

### GET `/api/search`
جستجوی سراسری.

**Query Parameters:**
| پارامتر | نوع | الزامی | توضیح |
|---------|-----|--------|-------|
| `q` | string | ✅ | عبارت جستجو (حداقل ۲ کاراکتر) |

**Response 200:**
```json
{
  "tasks": [
    { "type": "task", "id": "uuid", "title": "...", "subtitle": "نام workflow" }
  ],
  "processes": [
    { "type": "process", "id": "uuid", "title": "نام workflow", "subtitle": "running" }
  ],
  "forms": [
    { "type": "form", "id": "uuid", "title": "نام فرم", "subtitle": "توضیح" }
  ]
}
```

**محدودیت:** حداکثر ۵ نتیجه از هر دسته

---

## Comments

### GET `/api/comments`
لیست کامنت‌های یک هدف.

**Query Parameters:**
| پارامتر | نوع | توضیح |
|---------|-----|-------|
| `target_type` | string | `node` \| `task` \| `process` |
| `target_id` | string | شناسه هدف |

---

### POST `/api/comments`
افزودن کامنت.

**Body:**
```json
{
  "target_type": "task",
  "target_id": "uuid",
  "body": "متن کامنت",
  "mentions": ["user_id_1"]
}
```

---

## AI Chat

### POST `/api/ai/generate-workflow`
تولید workflow با هوش مصنوعی (SSE Streaming).

**Body:**
```json
{
  "session_id": "uuid-optional",
  "message": "یک فرایند درخواست مرخصی با تایید مدیر بساز"
}
```

**Response:** `text/event-stream`

```
data: تو\n\n
data: ضیح کوتاه\n\n
...
event: done
data: {"name":"...","nodes":[...],"edges":[...]}\n\n
```

---

### GET `/api/ai/sessions/{session_id}`
دریافت پیام‌های یک session.

**Response 200:** آرایه‌ای از ChatMessage objects

---

## Health Check

### GET `/api/`
بررسی سلامت سرور.

**Response 200:**
```json
{ "app": "jaryan", "ok": true }
```
