# ۵. مستندات Frontend

## فناوری‌ها

| ابزار | نسخه | کاربرد |
|-------|-------|--------|
| React | 19.0.0 | فریم‌ورک UI |
| React Router DOM | 7.15.0 | Routing |
| CRACO | 7.1.0 | Build config بر روی CRA |
| Tailwind CSS | 3.4.17 | استایل‌دهی |
| Shadcn/UI + Radix UI | — | کامپوننت‌های پایه |
| ReactFlow | 11.11.4 | ویرایشگر بصری فرایند |
| Recharts | 3.6.0 | نمودارهای آنالیتیکس |
| Framer Motion | 11.18.0 | انیمیشن‌ها |
| Axios | 1.16.0 | HTTP client |
| Lucide React | 0.516.0 | آیکون‌ها |
| moment-jalaali | 0.10.4 | تقویم شمسی |
| Sonner | 2.0.3 | Toast notifications |

---

## ساختار مسیرها (Routing)

```
/login              → صفحه ورود (RedirectIfAuthed)
/mobile             → تایید موبایل (RequireAuth)
/admin              → پنل ادمین (AdminRoute)
  /admin            → Dashboard
  /admin/chat       → AI Chat
  /admin/workflows  → لیست فرایندها
  /admin/workflows/:id         → Workflow Builder
  /admin/workflows/:id/simple  → Simple Workflow Builder
  /admin/forms      → لیست فرم‌ها
  /admin/forms/:id  → Form Builder
  /admin/users      → مدیریت کاربران
  /admin/org-chart  → نمودار سازمانی
  /admin/monitoring → نظارت فرایند
  /admin/analytics  → آنالیتیکس
/                   → پنل کاربر (RequireAuth)
  /                 → Dashboard
  /inbox            → کارتابل
  /monitoring       → نظارت
```

### Route Guards
- `RequireAuth`: اگر کاربر login نشده، به `/login` redirect می‌کند
- `AdminRoute`: اگر کاربر ادمین نیست، به `/` redirect می‌کند
- `RedirectIfAuthed`: اگر کاربر login شده، به پنل متناسب redirect می‌کند

---

## صفحات (Pages)

### `Login.js`
صفحه ورود با:
- لوگو و نام برند «جریان»
- فرم ایمیل + رمز عبور
- نمایش حساب‌های demo
- دکمه login سریع برای هر نقش

**State:** `email`, `password`, `loading`, `error`  
**API:** `POST /api/auth/login`

---

### `Dashboard.js`
داشبورد اصلی با:
- کارت‌های شمارنده (تسک‌ها، تاییدیه‌ها، فرایندهای در جریان، تعداد workflow‌ها)
- لیست «تسک‌های من»
- لیست «تاییدیه‌های در انتظار»
- لیست «فرایندهای در جریان»
- لاگ فعالیت‌ها
- پیشنهادهای هوشمند AI
- بخش Analytics (نمودارها)

**API:** `GET /api/dashboard`, `GET /api/analytics/dashboard`

---

### `Chat.js`
صفحه AI Chat-to-Workflow با:
- چت با AI به فارسی
- نمایش streaming پاسخ AI
- پیش‌نمایش workflow تولید شده
- دکمه «ذخیره و باز کردن در Builder»

**API:** `POST /api/ai/generate-workflow` (SSE)  
**Helper:** `streamAI()` از `lib/api.js`

---

### `WorkflowBuilder.js`
ویرایشگر بصری فرایند با ReactFlow:
- Canvas drag-and-drop
- Palette نود‌ها (trigger, task, approval, form, condition, AI Agent, OCR, end)
- Inspector پنل برای تنظیمات هر نود
- تنظیم شرط لبه‌ها (Edge conditions)
- بخش Comments
- بخش AI پنل
- دکمه‌های ذخیره، publish، archive
- دکمه شبیه‌سازی

**Node Types:**
| نوع | رنگ | کاربرد |
|-----|-----|--------|
| `trigger` | خاکستری تیره | نقطه شروع فرایند |
| `task` | آبی تیره | وظیفه دستی |
| `approval` | بنفش | نیاز به تایید/رد |
| `form` | سبز | پر کردن فرم |
| `condition` | زرد | تصمیم‌گیری (branch) |
| `ai_task` | بنفش روشن | پردازش AI خودکار |
| `ocr_task` | نارنجی | استخراج OCR |
| `end` | خاکستری | پایان فرایند |

---

### `SimpleWorkflowBuilder.js`
نسخه ساده‌تر Workflow Builder برای کاربران غیر تکنیکی.

---

### `FormBuilder.js`
ویرایشگر فرم Notion-style با:
- Palette انواع فیلد
- Drag & Drop ترتیب فیلدها
- Live Preview
- تنظیم `visible_if` (شرط نمایش فیلد)
- پشتیبانی از `tabs` (سربرگ‌ها)
- اعتبارسنجی‌های پیشرفته (min/max length, pattern)

**Field Types:** `text`, `textarea`, `number`, `date`, `select`, `checkbox`, `user`, `file`, `heading`, `divider`, `tabs`

---

### `Inbox.js`
کارتابل تسک‌ها با:
- Master/Detail view
- فیلترها (وضعیت، اولویت)
- نمایش inline فرم (FormRenderer)
- دکمه‌های تایید/رد
- نمایش badge SLA (دیرکرد / فوری)
- کامنت‌ها
- ذخیره پیش‌نویس

**API:** `GET /api/tasks?assigned_to_me=true`, `PATCH /api/tasks/{id}`

---

### `ProcessMonitoring.js`
نظارت بر فرایندها با:
- لیست فرایندهای در جریان
- نمودار درخت وضعیت
- شاخص SLA bottleneck
- جزئیات تاریخچه هر فرایند

---

### `Analytics.js`
داشبورد آنالیتیکس با:
- نمودار خطی «تعداد فرایند به تفکیک روز شمسی»
- نمودار دایره‌ای «توزیع تسک‌ها»
- جدول «برترین کاربران»
- کارت «میانگین زمان تکمیل»
- فیلتر بازه تاریخ

---

### `UserManagement.js`
مدیریت کاربران سازمان (فقط ادمین) با:
- لیست کاربران با avatar رنگی
- دکمه «افزودن کاربر» (modal)
- ویرایش نقش
- حذف کاربر (با تایید)

---

### `OrgChart.js`
نمودار سازمانی با:
- نمایش سلسله‌مراتب سازمان
- نمایش دپارتمان‌ها و مدیران

---

### `MobileApprovals.js`
صفحه تایید سریع موبایل در `/mobile`:
- لیست تاییدیه‌های pending
- Bottom-sheet detail view
- دکمه تایید/رد سریع

---

## کامپوننت‌ها

### `Layout.js`
Layout کاربران عادی:
- Sidebar با آیتم‌های: داشبورد، کارتابل، نظارت
- Badge نوتیفیکیشن روی کارتابل
- Mobile bottom navigation
- دکمه dark mode
- دکمه Command Palette
- اطلاعات کاربر + logout

### `AdminLayout.js`
Layout پنل ادمین:
- Sidebar با منوی کامل
- Command Palette
- آیکون جستجو

### `FormRenderer.js`
نمایش و submit فرم‌ها:
- خواندن `Form` از API
- پشتیبانی از منطق `visible_if`
- پشتیبانی از `tabs`
- نمایش `field_permissions` (editable/readonly/hidden)
- Submit با `form_data`

### `CommandPalette.js`
جستجوی سراسری (Ctrl+K):
- Debounce 300ms
- جستجو در tasks، processes، forms
- ناوبری با Enter/کلیک
- بسته شدن با Escape

### `TemplateLibraryModal.js`
کتابخانه تمپلیت فرایند:
- ۸+ تمپلیت آماده فارسی
- جستجو در تمپلیت‌ها
- پیش‌نمایش nodes
- ایجاد workflow از تمپلیت

### `ProcessTimeline.js`
Timeline اجرای فرایند با نمایش تاریخچه تسک‌ها.

---

## Contexts و State

### `AuthContext` (`lib/auth.js`)
```javascript
const { user, loading, login, logout } = useAuth();
// user: null | UserPublic
// loading: boolean
// login(email, password): Promise<UserPublic>
// logout(): void
```

### `BadgeContext` (`lib/badgeContext.js`)
```javascript
// Polling هر ۳۰ ثانیه برای تعداد تسک‌های pending
// توقف polling وقتی tab مخفی است
const { badgeCount } = useBadge();
```

### `ThemeContext` (`lib/themeContext.js`)
```javascript
const { theme, toggleTheme } = useTheme();
// theme: "light" | "dark"
```

---

## Lib utilities

### `api.js`
```javascript
export const api = axios.create({ baseURL: API_BASE });
// auto-attach JWT به هر request

export async function streamAI(message, sessionId, onDelta, onDone, onError)
// SSE streaming برای AI
```

### `jalali.js`
```javascript
// تبدیل ISO date به تاریخ شمسی
toJalali(isoDate) // "۱۴۰۳/۰۴/۱۵"
```

### `sla.js`
```javascript
// محاسبه وضعیت SLA
getSLAStatus(deadline, status) // "overdue" | "urgent" | null
```

### `formLogic.js`
```javascript
// ارزیابی visible_if
evaluateVisibility(rule, formData) // boolean
```

### `templates.js`
۸+ تمپلیت آماده فارسی hardcoded:
- درخواست مرخصی
- درخواست تنخواه
- درخواست خرید
- آنبوردینگ کارکنان
- درخواست IT
- درخواست مأموریت
- بازخورد عملکرد
- تمدید قرارداد

---

## متغیرهای محیطی Frontend

| متغیر | توضیح | مثال |
|-------|-------|------|
| `REACT_APP_BACKEND_URL` | آدرس Backend | `http://localhost:8000` |

---

## Build و اجرا

```bash
# Development
REACT_APP_BACKEND_URL=http://localhost:8000 yarn start

# Production build
yarn build
# خروجی در frontend/build/

# با Docker
docker build -t jaryan-frontend ./frontend
```

### nginx.conf
```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    
    location /api/ {
        proxy_pass http://backend:8000;
        proxy_set_header X-Accel-Buffering no;  # برای SSE
    }
    
    location / {
        try_files $uri $uri/ /index.html;  # SPA routing
    }
}
```
