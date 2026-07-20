# Design Document

## Overview

این سند طراحی فنی برای شش فیچر MVP پلتفرم «جریان» را پوشش می‌دهد. تمام تغییرات با معماری موجود (FastAPI + Motor + React/CRA) سازگارند و نیازی به dependency جدید ندارند.

---

## Architecture

```
backend/
  server.py         ← endpoints جدید: /analytics/dashboard, /users CRUD, /search
  models.py         ← UserCreate, UserRoleUpdate models جدید

frontend/src/
  lib/
    badgeContext.js  ← BadgeContext + polling (Feature 3)
    templates.js    ← 8 hardcoded Persian workflow templates (Feature 4)
    sla.js          ← getSLAStatus() helper (Feature 5)
  pages/
    Dashboard.js    ← analytics section اضافه می‌شود (Feature 1)
    UserManagement.js ← صفحه جدید /users (Feature 2)
    Inbox.js        ← SLA badges اضافه می‌شود (Feature 5)
    ProcessMonitoring.js ← overdue dot اضافه می‌شود (Feature 5)
    WorkflowsList.js ← template button اضافه می‌شود (Feature 4)
  components/
    Layout.js       ← badge + search icon + admin nav (Features 2,3,6)
    TemplateLibraryModal.js ← modal جدید (Feature 4)
    CommandPalette.js ← modal جدید (Feature 6)
  App.js            ← route /users + Ctrl+K listener
```

---

## Feature 1: Analytics Dashboard

### Backend: `GET /api/analytics/dashboard`

**Response shape:**
```json
{
  "daily_processes": [
    {"date": "1403-03-01", "count": 3},
    {"date": "1403-03-02", "count": 0}
  ],
  "task_status_dist": {
    "pending": 12,
    "in_progress": 5,
    "approved": 8,
    "rejected": 2,
    "done": 20
  },
  "top_users": [
    {"user_id": "...", "full_name": "سارا احمدی", "role": "کارمند", "task_count": 7}
  ],
  "avg_completion_minutes": 145
}
```

**Implementation logic (server.py):**
```python
@api.get("/analytics/dashboard")
async def analytics_dashboard(user: User = CurrentUser):
    now = datetime.now(timezone.utc)
    thirty_days_ago = now - timedelta(days=30)

    # 1. Daily process counts (last 30 days)
    processes = await db.process_instances.find(
        {"org_id": user.org_id, "created_at": {"$gte": thirty_days_ago.isoformat()}},
        {"_id": 0, "created_at": 1}
    ).to_list(10000)
    # group by Jalali date using jdatetime or manual conversion

    # 2. Task status distribution
    pipeline = [
        {"$match": {"org_id": user.org_id}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]
    status_agg = await db.tasks.aggregate(pipeline).to_list(10)

    # 3. Top 5 users by active tasks
    pipeline2 = [
        {"$match": {"org_id": user.org_id, "status": {"$in": ["pending", "in_progress"]}}},
        {"$group": {"_id": "$assignee_id", "task_count": {"$sum": 1}}},
        {"$sort": {"task_count": -1}},
        {"$limit": 5}
    ]

    # 4. Avg completion time
    completed = await db.process_instances.find(
        {"org_id": user.org_id, "status": "completed",
         "updated_at": {"$gte": thirty_days_ago.isoformat()}},
        {"_id": 0, "created_at": 1, "updated_at": 1}
    ).to_list(1000)
```

**Jalali date conversion:** از `jdatetime` library در backend استفاده می‌شود. اگر نصب نباشد، `updated_at` را parse کرده و offset روز شمسی را محاسبه می‌کنیم:

```python
import jdatetime
jd = jdatetime.datetime.fromgregorian(datetime=dt)
key = f"{jd.year}-{jd.month:02d}-{jd.day:02d}"
```

**Frontend changes in `Dashboard.js`:**
- یک section جدید `AnalyticsSection` زیر counters اضافه می‌شود
- `useEffect` جداگانه برای `/api/analytics/dashboard`
- خطا در analytics section ایزوله است و بقیه داشبورد را کرش نمی‌کند

```jsx
// recharts LineChart for daily_processes
<LineChart data={analytics.daily_processes}>
  <XAxis dataKey="date" />
  <YAxis />
  <Line type="monotone" dataKey="count" stroke="#4f46e5" />
</LineChart>

// recharts PieChart for task_status_dist
<PieChart>
  <Pie data={pieData} dataKey="value" nameKey="name" />
</PieChart>
```

---

## Feature 2: User Management

### Backend Endpoints

**`POST /api/users`** — ادمین محور
```python
class UserCreate(BaseModel):
    full_name: str  # 1-100 chars
    email: EmailStr
    role: RoleFa
    password: str   # 6-128 chars

@api.post("/users")
async def create_user(payload: UserCreate, user: User = CurrentUser):
    if user.role != "ادمین سازمان":
        raise HTTPException(403, "insufficient_permissions")
    existing = await db.users.find_one({"email": payload.email})
    if existing:
        raise HTTPException(409, "email_already_exists")
    new_user = User(
        org_id=user.org_id,
        email=payload.email,
        full_name=payload.full_name,
        role=payload.role,
        password_hash=hash_password(payload.password),
    )
    await db.users.insert_one(new_user.to_mongo())
    return public_user(new_user)
```

**`PATCH /api/users/{uid}`** — فقط role
```python
class UserRoleUpdate(BaseModel):
    role: RoleFa

@api.patch("/users/{uid}")
async def update_user_role(uid: str, payload: UserRoleUpdate, user: User = CurrentUser):
    if user.role != "ادمین سازمان":
        raise HTTPException(403, "insufficient_permissions")
    doc = await db.users.find_one({"id": uid, "org_id": user.org_id})
    if not doc:
        raise HTTPException(404, "user_not_found")
    await db.users.update_one({"id": uid}, {"$set": {"role": payload.role, "updated_at": now_iso()}})
    return {**doc, "role": payload.role}
```

**`DELETE /api/users/{uid}`**
```python
@api.delete("/users/{uid}")
async def delete_user(uid: str, user: User = CurrentUser):
    if user.role != "ادمین سازمان":
        raise HTTPException(403, "insufficient_permissions")
    if uid == user.id:
        raise HTTPException(400, "cannot_delete_self")
    doc = await db.users.find_one({"id": uid, "org_id": user.org_id})
    if not doc:
        raise HTTPException(404, "user_not_found")
    await db.users.delete_one({"id": uid})
    return {"deleted": True}
```

### Frontend: `UserManagement.js`

```
/users → UserManagement.js
  ├── Header (عنوان + دکمه «افزودن کاربر»)
  ├── UserTable (لیست کاربران با آواتار، نام، ایمیل، نقش)
  │   └── هر سطر: RoleDropdown + DeleteButton
  ├── AddUserModal (Dialog از Radix)
  │   └── فرم: نام، ایمیل، نقش، رمز عبور
  └── DeleteConfirmDialog (AlertDialog از Radix)
```

**Route guard در `App.js`:**
```jsx
<Route path="users" element={
  <RequireAuth>
    <AdminOnly>
      <UserManagement />
    </AdminOnly>
  </RequireAuth>
} />
```

**Sidebar nav item** — فقط برای ادمین نمایش داده می‌شود:
```jsx
{user?.role === "ادمین سازمان" && (
  <NavLink to="/users" data-testid="nav-users">
    <Users className="w-4 h-4" /> مدیریت کاربران
  </NavLink>
)}
```

---

## Feature 3: Badge Notification

### `frontend/src/lib/badgeContext.js`

```jsx
const BadgeContext = createContext({ pendingCount: 0 });

export function BadgeProvider({ children }) {
  const { user } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  const retryCount = useRef(0);
  const timerRef = useRef(null);

  const fetchBadge = async () => {
    try {
      const r = await api.get("/tasks?assigned_to_me=true&status=pending");
      setPendingCount(r.data.length);
      retryCount.current = 0;
    } catch {
      if (retryCount.current < 3) {
        retryCount.current++;
        setTimeout(fetchBadge, 10000);
      }
    }
  };

  useEffect(() => {
    if (!user) { setPendingCount(0); return; }
    fetchBadge();

    const startPolling = () => {
      timerRef.current = setInterval(() => {
        if (!document.hidden) fetchBadge();
      }, 30000);
    };

    const handleVisibility = () => {
      if (document.hidden) {
        clearInterval(timerRef.current);
      } else {
        fetchBadge();
        startPolling();
      }
    };

    startPolling();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [user]);

  return <BadgeContext.Provider value={{ pendingCount }}>{children}</BadgeContext.Provider>;
}

export const useBadge = () => useContext(BadgeContext);
```

**Integration در `Layout.js`:**
```jsx
const { pendingCount } = useBadge();

// در NavLink کارتابل:
{pendingCount > 0 && (
  <span className="ms-auto text-[10px] bg-red-500 text-white rounded-full px-1.5 min-w-[18px] text-center">
    {pendingCount > 99 ? "+۹۹" : toFaNumber(pendingCount)}
  </span>
)}
```

---

## Feature 4: Template Library

### `frontend/src/lib/templates.js`

```js
export const WORKFLOW_TEMPLATES = [
  {
    id: "leave",
    name: "درخواست مرخصی",
    description: "فرایند استاندارد درخواست و تایید مرخصی کارکنان",
    icon: "Calendar",
    nodes: [
      { id: "n1", type: "trigger", label: "شروع درخواست", position: { x: 80, y: 120 }, data: {} },
      { id: "n2", type: "form", label: "تکمیل فرم مرخصی", position: { x: 340, y: 120 }, data: { assignee_role: "کارمند" } },
      { id: "n3", type: "approval", label: "تایید مدیر تیم", position: { x: 600, y: 120 }, data: { assignee_role: "مدیر تیم" } },
      { id: "n4", type: "end", label: "اعلام نتیجه", position: { x: 860, y: 120 }, data: {} }
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4" }
    ]
  },
  // ... 7 تمپلیت دیگر
];
```

**8 تمپلیت:** مرخصی، تنخواه، خرید، آنبوردینگ کارمند، درخواست IT، مأموریت، بازخورد عملکرد، قرارداد

### `frontend/src/components/TemplateLibraryModal.js`

```
TemplateLibraryModal
  ├── Dialog wrapper (Radix Dialog)
  ├── SearchInput (جستجو در name + description)
  ├── TemplateGrid (grid-cols-2 lg:grid-cols-3)
  │   └── TemplateCard (آیکون، نام، توضیح، تعداد nodes)
  └── PreviewPanel (وقتی تمپلیت انتخاب شده)
      ├── لیست nodes (type badge + label)
      ├── تعداد edges
      └── دکمه «استفاده از این تمپلیت»
```

**Data flow:**
```
کلیک «از تمپلیت شروع کن»
  → modal باز می‌شود
  → کاربر تمپلیت را انتخاب می‌کند
  → preview نمایش داده می‌شود
  → کلیک «استفاده»
  → POST /api/workflows با nodes/edges تمپلیت
  → redirect به /workflows/{new_id}
```

---

## Feature 5: SLA Visual Indicators

### `frontend/src/lib/sla.js`

```js
/**
 * @param {string|null} deadline - ISO date string
 * @param {string} status - task status
 * @returns {'overdue'|'urgent'|null}
 */
export function getSLAStatus(deadline, status) {
  if (!deadline) return null;
  if (["done", "approved", "rejected"].includes(status)) return null;

  const now = Date.now();
  const dl = new Date(deadline).getTime();
  const diff = dl - now;

  if (diff < 0) return "overdue";
  if (diff < 86400 * 1000) return "urgent";
  return null;
}

export const SLA_BADGE = {
  overdue: {
    label: "دیرکرد",
    cls: "bg-red-50 text-red-700 border border-red-200"
  },
  urgent: {
    label: "فوری",
    cls: "bg-amber-50 text-amber-700 border border-amber-200"
  }
};
```

**Integration points:**

1. **`Inbox.js`** — در هر row تسک:
```jsx
const sla = getSLAStatus(t.deadline, t.status);
{sla && (
  <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${SLA_BADGE[sla].cls}`}>
    {SLA_BADGE[sla].label}
  </span>
)}
```

2. **`Dashboard.js`** — در section «تسک‌های من» همان منطق

3. **`ProcessMonitoring.js`** — برای هر فرایند در لیست:
```jsx
// نیاز به واکشی tasks مرتبط با هر process داریم
// راه‌حل: از endpoint موجود GET /processes/{pid} استفاده می‌کنیم
// یا: در لیست فرایندها یک indicator ساده بر اساس SLA
const hasOverdue = detail?.tasks?.some(t => getSLAStatus(t.deadline, t.status) === "overdue");
{hasOverdue && <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />}
```

---

## Feature 6: Command Palette

### Backend: `GET /api/search?q={query}`

```python
@api.get("/search")
async def global_search(q: str = Query(min_length=2), user: User = CurrentUser):
    pattern = {"$regex": q, "$options": "i"}
    org = user.org_id

    tasks = await db.tasks.find(
        {"org_id": org, "$or": [{"title": pattern}, {"workflow_name": pattern}]},
        {"_id": 0, "id": 1, "title": 1, "workflow_name": 1, "status": 1}
    ).limit(5).to_list(5)

    processes = await db.process_instances.find(
        {"org_id": org, "workflow_name": pattern},
        {"_id": 0, "id": 1, "workflow_name": 1, "status": 1}
    ).limit(5).to_list(5)

    forms = await db.forms.find(
        {"org_id": org, "name": pattern},
        {"_id": 0, "id": 1, "name": 1, "description": 1}
    ).limit(5).to_list(5)

    return {
        "tasks": [{"type": "task", "id": t["id"], "title": t["title"], "subtitle": t["workflow_name"]} for t in tasks],
        "processes": [{"type": "process", "id": p["id"], "title": p["workflow_name"], "subtitle": p["status"]} for p in processes],
        "forms": [{"type": "form", "id": f["id"], "title": f["name"], "subtitle": f.get("description", "")} for f in forms],
    }
```

### `frontend/src/components/CommandPalette.js`

```
CommandPalette (controlled by isOpen prop)
  ├── Overlay (backdrop blur, onClick → close)
  ├── Modal container (max-w-2xl, centered)
  │   ├── SearchInput (autoFocus, onChange → setQuery)
  │   ├── LoadingSpinner (while fetching)
  │   ├── ResultsList
  │   │   ├── Section «تسک‌ها» (Inbox icon)
  │   │   ├── Section «فرایندها» (Workflow icon)
  │   │   └── Section «فرم‌ها» (FileText icon)
  │   └── EmptyState («نتیجه‌ای یافت نشد»)
  └── KeyboardShortcut hint (Ctrl+K)
```

**State & Logic:**
```jsx
const [query, setQuery] = useState("");
const [results, setResults] = useState(null);
const [loading, setLoading] = useState(false);

// 300ms debounce
useEffect(() => {
  if (query.length < 2) { setResults(null); return; }
  const timer = setTimeout(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/search?q=${encodeURIComponent(query)}`);
      setResults(r.data);
    } catch { setError(true); }
    finally { setLoading(false); }
  }, 300);
  return () => clearTimeout(timer);
}, [query]);
```

**Global Ctrl+K in `App.js`:**
```jsx
const [paletteOpen, setPaletteOpen] = useState(false);

useEffect(() => {
  const handler = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      setPaletteOpen(true);
    }
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}, []);
```

**Navigation on result click:**
```js
const navigateTo = (result) => {
  if (result.type === "task") navigate("/inbox");
  if (result.type === "process") navigate("/monitoring");
  if (result.type === "form") navigate(`/forms/${result.id}`);
  setPaletteOpen(false);
};
```

---

## Components and Interfaces

### New Backend Models (models.py)

```python
class UserCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    role: RoleFa
    password: str = Field(min_length=6, max_length=128)

class UserRoleUpdate(BaseModel):
    role: RoleFa

class SearchResult(BaseModel):
    type: Literal["task", "process", "form"]
    id: str
    title: str
    subtitle: str

class SearchResponse(BaseModel):
    tasks: list[SearchResult]
    processes: list[SearchResult]
    forms: list[SearchResult]

class AnalyticsDailyPoint(BaseModel):
    date: str   # "1403-03-01"
    count: int

class AnalyticsTopUser(BaseModel):
    user_id: str
    full_name: str
    role: str
    task_count: int

class AnalyticsDashboardResponse(BaseModel):
    daily_processes: list[AnalyticsDailyPoint]
    task_status_dist: dict  # {pending, in_progress, approved, rejected, done}
    top_users: list[AnalyticsTopUser]
    avg_completion_minutes: Optional[float]
```

### New Frontend Components

| Component | Path | Props |
|-----------|------|-------|
| `TemplateLibraryModal` | `src/components/TemplateLibraryModal.js` | `isOpen, onClose` |
| `CommandPalette` | `src/components/CommandPalette.js` | `isOpen, onClose` |
| `SLABadge` | inline در `sla.js` | `deadline, status` |

### New Frontend Pages

| Page | Path | Route |
|------|------|-------|
| `UserManagement` | `src/pages/UserManagement.js` | `/users` |

### New Frontend Libs

| File | Purpose |
|------|---------|
| `src/lib/badgeContext.js` | BadgeContext + polling hook |
| `src/lib/templates.js` | 8 hardcoded workflow templates |
| `src/lib/sla.js` | getSLAStatus() + SLA_BADGE constants |

---

## Data Models

### Analytics Response (از backend به frontend)
```
GET /api/analytics/dashboard
→ {
    daily_processes: [{date: string (Jalali), count: number}]  // 30 items
    task_status_dist: {pending, in_progress, approved, rejected, done: number}
    top_users: [{user_id, full_name, role, task_count}]  // max 5
    avg_completion_minutes: number | null
  }
```

### Search Response
```
GET /api/search?q={string}
→ {
    tasks: [{type:"task", id, title, subtitle}]      // max 5
    processes: [{type:"process", id, title, subtitle}] // max 5
    forms: [{type:"form", id, title, subtitle}]       // max 5
  }
```

### Template Data Structure
```js
{
  id: string,
  name: string,          // فارسی، حداکثر 40 کاراکتر
  description: string,   // فارسی، حداکثر 70 کاراکتر
  icon: string,          // lucide-react icon name
  nodes: WorkflowNode[], // سازگار با مدل WorkflowNode
  edges: WorkflowEdge[]  // سازگار با مدل WorkflowEdge
}
```

### Badge Context State
```js
{
  pendingCount: number,  // تعداد تسک‌های pending کاربر جاری
}
```

---

## Correctness Properties

### Property 1: Org Isolation
هر endpoint که داده‌های org-specific برمی‌گرداند باید `org_id` از JWT را استفاده کند نه از query param:
- `GET /analytics/dashboard` → فقط داده‌های `user.org_id`
- `GET /search` → فقط داده‌های `user.org_id`
- `POST/PATCH/DELETE /users/{id}` → target user باید همان `org_id` داشته باشد

**Validates: Requirements 1.12, 6.7**

### Property 2: Admin-Only Mutations
عملیات `POST /users`، `PATCH /users/{id}`، `DELETE /users/{id}` باید برای غیر-ادمین با `403` fail شوند.

**Validates: Requirements 2.13, 2.14, 2.15, 2.16**

### Property 3: Self-Protection
`DELETE /users/{user.id}` → `400 cannot_delete_self`
`PATCH /users/{user.id}` با role غیر از ادمین → frontend block (no backend call)

**Validates: Requirements 2.11, 2.12**

### Property 4: SLA Computation Purity
`getSLAStatus(deadline, status)` یک pure function است — بدون side effect، بدون API call.
ورودی یکسان → خروجی یکسان در لحظه مشخص.

**Validates: Requirements 5.1, 5.2, 5.3**

### Property 5: Badge Polling Isolation
Polling باید فقط وقتی `document.hidden === false` و `user !== null` اجرا شود.
هنگام logout: `pendingCount = 0` و `clearInterval`.

**Validates: Requirements 3.5, 3.6, 3.10**

---

## Error Handling

### Backend Error Codes
| Scenario | Status | Detail |
|----------|--------|--------|
| Non-admin calls user mutation | 403 | `insufficient_permissions` |
| Duplicate email on POST /users | 409 | `email_already_exists` |
| DELETE own account | 400 | `cannot_delete_self` |
| PATCH/DELETE user not in org | 404 | `user_not_found` |
| Search query < 2 chars | 422 | FastAPI validation error |

### Frontend Error Handling
- Analytics section: خطا → نمایش fallback card با پیام «خطا در بارگذاری آمار»
- Badge polling: خطا → retry حداکثر ۳ بار با فاصله ۱۰ ثانیه، بعد silent fail
- Template creation: خطا → `toast.error("خطا در ایجاد فرایند. دوباره تلاش کنید.")`
- Search: خطا → پیام «خطا در جستجو. دوباره تلاش کنید.» در Command Palette
- User CRUD: خطا → `toast.error()` با پیام متناسب + rollback UI state

---

## Testing Strategy

### Backend Unit Tests
- `GET /analytics/dashboard`: بررسی aggregation صحیح با داده seed
- `POST /users` با role غیر ادمین → 403
- `POST /users` با email تکراری → 409
- `DELETE /users/{own_id}` → 400
- `GET /search?q=مرخصی` → نتایج از همان org

### Frontend Testing (data-testid محور)
- Badge: بررسی نمایش عدد صحیح در `[data-testid="nav-inbox"]`
- SLA badges: بررسی `[data-testid="sla-overdue-{id}"]` برای task‌های دیرکرد
- Template modal: باز شدن با کلیک `[data-testid="from-template-btn"]`
- Command palette: باز شدن با Ctrl+K، جستجو و نتیجه در `[data-testid="command-palette"]`
- User management: CRUD cycle با testid‌های مشخص شده

### Property-Based Tests
- `getSLAStatus()`: برای هر deadline در گذشته → باید `overdue` برگرداند
- `getSLAStatus()` برای status `done/approved/rejected` → باید `null` برگرداند

---

## Cross-Cutting Concerns

### Error Handling Pattern
همه API calls از `try/catch` استفاده می‌کنند. خطاها با `toast.error()` از sonner نمایش داده می‌شوند.

### RTL & Persian UI Rules
- تمام کامپوننت‌های جدید `dir="rtl"` دارند
- از Tailwind logical properties: `ms-*`, `me-*`, `ps-*`, `pe-*`
- اعداد با `toFaNumber()` از `jalali.js`

### Auth Role Guard Pattern
```jsx
// در pages با دسترسی محدود
const { user } = useAuth();
useEffect(() => {
  if (user && user.role !== "ادمین سازمان") navigate("/");
}, [user, navigate]);
```

### File Naming Convention
- Pages: PascalCase در `src/pages/`
- Components: PascalCase در `src/components/`
- Libs: camelCase در `src/lib/`
- همه `.js` (نه `.tsx`)

### data-testid Convention
هر element تعاملی باید `data-testid` داشته باشد:
- `nav-users`, `add-user-btn`, `user-row-{id}`, `delete-user-{id}`, `edit-role-{id}`
- `badge-inbox`, `search-icon`, `command-palette`, `search-input`
- `template-modal`, `template-card-{id}`, `use-template-btn`
- `sla-overdue-{id}`, `sla-urgent-{id}`
