# Implementation Plan: Jaryan MVP Enhancements

## Overview

9 tasks implementing 6 MVP features for the Jaryan workflow platform:
1. Analytics Dashboard (backend + frontend)
2. User Management (backend + frontend)
3. Global Search (backend + frontend)
4. SLA Visual Indicators (frontend)
5. Badge Notification (frontend)
6. Template Library (frontend)

Backend tasks (1-3) can run in parallel. Frontend tasks depend on their respective backend tasks where applicable. Tasks 4, 5, 6 are frontend-only and can run in parallel with backend tasks.

## Tasks

- [x] 1. Backend Analytics Endpoint
  - Add `AnalyticsDashboardResponse` Pydantic model shape to `backend/models.py` (or inline in server.py)
  - Add `jdatetime` to `backend/requirements.txt` for Jalali date conversion
  - Implement `GET /api/analytics/dashboard` in `backend/server.py`:
    - Query `process_instances` for last 30 days grouped by Jalali date → `daily_processes` (30 items, missing days = 0)
    - Aggregate `tasks` by `status` → `task_status_dist` dict
    - Aggregate `tasks` by `assignee_id` for pending/in_progress, join with `users` collection → `top_users` list (max 5, sorted descending)
    - Compute `avg_completion_minutes` from completed processes in last 30 days (created_at to updated_at delta in minutes), null if none
  - Protect endpoint with `CurrentUser` JWT dependency
  - Return JSON: `{daily_processes, task_status_dist, top_users, avg_completion_minutes}`
  - **Validates:** Requirements 1.1, 1.4, 1.6, 1.8, 1.12

- [ ] 2. Backend User Management Endpoints
  - Add `UserCreate` and `UserRoleUpdate` models to `backend/models.py`
  - Implement `POST /api/users` in `backend/server.py`:
    - Admin-only guard: role != "ادمین سازمان" → 403 `insufficient_permissions`
    - Duplicate email check → 409 `email_already_exists`
    - Create user with `org_id` from JWT, `hash_password()` for password
    - Return `public_user()` response
  - Implement `PATCH /api/users/{uid}` (role update only):
    - Admin-only guard → 403
    - Find user by `id` AND `org_id` → 404 `user_not_found` if not in same org
    - Update `role` + `updated_at`
  - Implement `DELETE /api/users/{uid}`:
    - Admin-only guard → 403
    - Self-deletion guard: `uid == user.id` → 400 `cannot_delete_self`
    - Find user by `id` AND `org_id` → 404 if not found
    - Delete user document
  - **Validates:** Requirements 2.13, 2.14, 2.15, 2.16

- [x] 3. Backend Global Search Endpoint
  - Implement `GET /api/search` in `backend/server.py`:
    - Query parameter `q: str = Query(min_length=2)` (FastAPI validates)
    - Build case-insensitive MongoDB regex: `{"$regex": q, "$options": "i"}`
    - Search `tasks`: match `title` OR `workflow_name`, filter `org_id`, limit 5
    - Search `process_instances`: match `workflow_name`, filter `org_id`, limit 5
    - Search `forms`: match `name`, filter `org_id`, limit 5
    - Return `{"tasks": [...], "processes": [...], "forms": [...]}` each item `{type, id, title, subtitle}`
  - Protect with `CurrentUser` JWT dependency
  - **Validates:** Requirements 6.6, 6.7, 6.8

- [ ] 4. Frontend SLA Helper and Visual Indicators
  - Create `frontend/src/lib/sla.js`:
    - Export `getSLAStatus(deadline, status)` pure function: returns `"overdue"` | `"urgent"` | `null`
    - Returns `null` if no deadline or status is `done/approved/rejected`
    - Returns `"overdue"` if `new Date(deadline) < Date.now()`
    - Returns `"urgent"` if `0 < (deadline_ms - now_ms) < 86_400_000`
    - Export `SLA_BADGE = { overdue: {label:"دیرکرد", cls:"bg-red-50 text-red-700 border border-red-200"}, urgent: {label:"فوری", cls:"bg-amber-50 text-amber-700 border border-amber-200"} }`
  - Update `frontend/src/pages/Inbox.js` task list rows: import `getSLAStatus`/`SLA_BADGE`, render badge after status badge; `data-testid="sla-overdue-{id}"` or `data-testid="sla-urgent-{id}"`
  - Update `frontend/src/pages/Dashboard.js` "تسک‌های من" section: same SLA badge for each task
  - Update `frontend/src/pages/ProcessMonitoring.js` process list: for each process row, show `<span className="w-2 h-2 rounded-full bg-red-500 inline-block ms-1" />` if any tasks of the selected detail have overdue status (derive from `detail.tasks` for active process)
  - **Validates:** Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7

- [-] 5. Frontend Badge Context and Layout Integration
  - Create `frontend/src/lib/badgeContext.js`:
    - `BadgeContext` with `{ pendingCount: 0 }` default
    - `BadgeProvider` component using `useAuth()`:
      - On mount with user: fetch `/api/tasks?assigned_to_me=true&status=pending`, set `pendingCount = response.data.length`
      - Start `setInterval(30000)` that calls fetch only when `!document.hidden`
      - Add `visibilitychange` listener: `hidden` → `clearInterval`; `visible` → immediate fetch + restart interval
      - On fetch error: retry up to 3 times with 10s delay, keep last count on failure
      - On user logout (user becomes null): `clearInterval`, `setPendingCount(0)`
    - Export `useBadge()` hook: `useContext(BadgeContext)`
  - Update `frontend/src/App.js`: wrap app tree with `<BadgeProvider>` inside `<AuthProvider>`
  - Update `frontend/src/components/Layout.js`:
    - Import `useBadge`
    - In Sidebar `NavLink` for `/inbox`: add badge span when `pendingCount > 0`, content `pendingCount > 99 ? "+۹۹" : toFaNumber(pendingCount)`, `data-testid="badge-inbox"`, class `ms-auto text-[10px] bg-red-500 text-white rounded-full px-1.5 min-w-[18px] text-center`
    - In `MobileBottomNav` for `/inbox` item: same badge logic
  - **Validates:** Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10

- [~] 6. Frontend Template Library
  - Create `frontend/src/lib/templates.js` with 8 hardcoded Persian workflow templates:
    1. مرخصی (Calendar): trigger → form(کارمند) → approval(مدیر تیم) → end
    2. تنخواه (Banknote): trigger → form(کارمند) → approval(مدیر تیم) → approval(ادمین سازمان) → task(ادمین سازمان) → end
    3. درخواست خرید (ShoppingCart): trigger → form(کارمند) → approval(مدیر تیم) → approval(ادمین سازمان) → task(ادمین سازمان) → end
    4. آنبوردینگ کارمند (UserPlus): trigger → task(ادمین سازمان) → task(کارمند) → task(مدیر تیم) → end
    5. درخواست IT (Monitor): trigger → form(کارمند) → approval(مدیر تیم) → task(ادمین سازمان) → end
    6. مأموریت (Plane): trigger → form(کارمند) → approval(مدیر تیم) → end
    7. بازخورد عملکرد (Star): trigger → form(کارمند) → task(مدیر تیم) → approval(مدیر تیم) → end
    8. قرارداد (FileSignature): trigger → form(کارمند) → approval(مدیر تیم) → approval(ادمین سازمان) → task(ادمین سازمان) → end
    Each: `{id, name, description(≤70 chars), icon(string), nodes[], edges[]}`
  - Create `frontend/src/components/TemplateLibraryModal.js`:
    - Radix `Dialog` with overlay; `data-testid="template-modal"`
    - Search input filtering templates by name+description (case-insensitive substring)
    - Grid of template cards (`data-testid="template-card-{id}"`): icon component, name, description, node count
    - Selected template preview panel: node list (type badge + label), edge count, "استفاده از این تمپلیت" button (`data-testid="use-template-btn"`)
    - On use: `POST /api/workflows` → navigate `/workflows/{id}` on success; `toast.error()` on failure
    - Close on Escape/outside click (Radix default)
  - Update `frontend/src/pages/WorkflowsList.js`: add "از تمپلیت شروع کن" button next to new workflow button, `data-testid="from-template-btn"`, open `TemplateLibraryModal`
  - **Validates:** Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12

- [~] 7. Frontend User Management Page
  - Create `frontend/src/pages/UserManagement.js`:
    - Admin guard: `useEffect` with `navigate("/")` if `user?.role !== "ادمین سازمان"`
    - Fetch users: `GET /api/users` on mount
    - Page layout: header with title "مدیریت کاربران" + "افزودن کاربر" button (`data-testid="add-user-btn"`)
    - User list: each row shows colored avatar circle, full_name, email, role badge, edit-role dropdown, delete button (`data-testid="user-row-{id}"`, `data-testid="delete-user-{id}"`, `data-testid="edit-role-{id}"`)
    - Add user modal (Radix Dialog): fields for full_name, email, role (Select), password; submit → `POST /api/users`; on 409 show inline error «این ایمیل قبلاً ثبت شده است»; on success refresh list + `toast.success("کاربر افزوده شد")`
    - Role edit: inline Select; if `uid === user.id` show toast error, no API call; on change → `PATCH /api/users/{uid}`; on error rollback + `toast.error()`
    - Delete: Radix AlertDialog; if `uid === user.id` show error «امکان حذف حساب خودتان وجود ندارد», dismiss; on confirm → `DELETE /api/users/{uid}`; on success remove from list + `toast.success("کاربر حذف شد")`
  - Update `frontend/src/App.js`:
    - Import `UserManagement`
    - Add `<Route path="users" element={<RequireAuth><UserManagement /></RequireAuth>} />` inside layout routes
  - Update `frontend/src/components/Layout.js` Sidebar:
    - Add nav item "مدیریت کاربران" with `Users` icon from lucide-react, only when `user?.role === "ادمین سازمان"`, `data-testid="nav-users"`, `to="/users"`
  - **Validates:** Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.17

- [~] 8. Frontend Command Palette
  - Create `frontend/src/components/CommandPalette.js`:
    - Props: `isOpen: bool, onClose: function`
    - When `isOpen`: render fixed overlay (backdrop-blur, click-outside calls `onClose`) + centered modal `max-w-2xl bg-white rounded-xl border`; `data-testid="command-palette"`
    - Search input `autoFocus`; `data-testid="search-input"` 
    - State: `query`, `results`, `loading`, `error`
    - `useEffect` on `query`: if `< 2` chars → `setResults(null)`; else debounce 300ms → `GET /api/search?q={query}`
    - While loading: spinner (Loader2 from lucide-react animate-spin)
    - Results: grouped sections «تسک‌ها» / «فرایندها» / «فرم‌ها», each item shows icon + title + subtitle; click → navigate + `onClose()`
    - Navigation: tasks → `/inbox`, processes → `/monitoring`, forms → `/forms/{id}`
    - Empty (query ≥ 2, no results): «نتیجه‌ای یافت نشد»
    - Error: «خطا در جستجو. دوباره تلاش کنید.»
    - Escape key listener closes palette
  - Update `frontend/src/App.js`:
    - Add `paletteOpen` state + global `keydown` listener for `Ctrl+K`/`Cmd+K` (preventDefault + open)
    - Render `<CommandPalette isOpen={paletteOpen} onClose={() => setPaletteOpen(false)} />` inside `BrowserRouter` (after `AppRoutes`)
    - Pass `setPaletteOpen` via a simple context or prop threading to Layout
  - Update `frontend/src/components/Layout.js` Sidebar:
    - Add Search icon button in sidebar (above nav list), `data-testid="search-icon-btn"`, `onClick → open palette`
    - Accept `onSearchOpen` prop or use a shared context
  - **Validates:** Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.9, 6.10, 6.11, 6.12, 6.13

- [~] 9. Frontend Analytics Dashboard Charts
  - Update `frontend/src/pages/Dashboard.js`:
    - Add separate `analyticsData`, `analyticsLoading`, `analyticsError` state
    - Add `useEffect` on mount: call `GET /api/analytics/dashboard` once; set states accordingly
    - Add `AnalyticsSection` component (inline or separate) below counters:
      - If `analyticsLoading`: show 4 skeleton placeholder divs with `animate-pulse bg-neutral-100 rounded-xl`
      - If `analyticsError`: show single card with «خطا در بارگذاری آمار تحلیلی» — does NOT affect rest of dashboard
      - If `analyticsData`:
        - **Line chart** (`data-testid="chart-daily-processes"`): `ResponsiveContainer` + `LineChart` with `daily_processes`, `XAxis dataKey="date"`, `YAxis`, `Line type="monotone" dataKey="count" stroke="#4f46e5" strokeWidth={2}`
        - **Pie chart** (`data-testid="chart-task-status"`): `ResponsiveContainer` + `PieChart` + `Pie` with Persian status labels, `Tooltip`, `Legend`
        - **Top users card** (`data-testid="top-users-card"`): list of `top_users` with avatar circle (first char of name), full_name, role, `toFaNumber(task_count)` tasks
        - **Avg completion card** (`data-testid="avg-completion-card"`): format `avg_completion_minutes`: < 60 → «X دقیقه», 60–1439 → «X ساعت و Y دقیقه», ≥ 1440 → «X روز و Y ساعت»; null → «داده کافی ندارد»
    - Layout: `grid grid-cols-1 lg:grid-cols-2 gap-4 mt-8` for charts row; cards below in similar grid
  - recharts is already installed (`recharts: 3.6.0` in package.json) — no new deps
  - **Validates:** Requirements 1.2, 1.3, 1.5, 1.7, 1.9, 1.10, 1.11, 1.13

## Task Dependency Graph

```
Task 1 (Backend Analytics) ──────────────────────────────► Task 9 (Frontend Analytics Charts)
Task 2 (Backend User Mgmt) ──────────────────────────────► Task 7 (Frontend User Mgmt Page)
Task 3 (Backend Search) ─────────────────────────────────► Task 8 (Frontend Command Palette)
Task 4 (Frontend SLA) ──── no dependencies (frontend only)
Task 5 (Frontend Badge) ─── no dependencies (uses existing /tasks endpoint)
Task 6 (Frontend Templates) ─ no dependencies (frontend only, uses existing /workflows endpoint)
```

```json
{
  "waves": [
    {"wave": 1, "tasks": [1, 2, 3, 4, 5, 6]},
    {"wave": 2, "tasks": [7, 8, 9]}
  ],
  "dependencies": {
    "7": [2],
    "8": [3],
    "9": [1]
  }
}
```

Tasks 1, 2, 3, 4, 5, 6 can all run in parallel.
Tasks 7, 8, 9 depend on their respective backend tasks (2, 3, 1).

## Notes

- All `.js` files (not `.tsx`) as per project convention
- RTL/Persian-first: use Tailwind logical properties (`ms-*`, `me-*`, `ps-*`, `pe-*`)
- All interactive elements need `data-testid` attributes
- No new npm dependencies needed (recharts, lucide-react, @radix-ui/* all already installed)
- `jdatetime` Python package needed for backend Jalali date conversion
- Local dev: no Docker — run `uvicorn server:app --reload` and `yarn start` directly
