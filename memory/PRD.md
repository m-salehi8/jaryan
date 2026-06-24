# راهکار (Raahkar) — PRD

## Original Problem Statement
Bootstrap a next-generation, AI-first "Workflow Automation and Process Builder" platform for the Iranian market.
Must be Persian/RTL native, use Jalali (Shamsi) calendar, Vazirmatn font, monochromatic minimal aesthetic (Notion + Linear + n8n + Monday inspired).

## Architecture Decisions
- **Tech Stack**: FastAPI (Python) + MongoDB + React 19 + Tailwind + Shadcn/UI
- **AI**: Claude Sonnet 4.6 via `emergentintegrations` (Emergent Universal Key) with SSE streaming
- **Canvas**: `reactflow` for the visual workflow builder (custom monochromatic nodes)
- **Dates**: `moment-jalaali` with Persian digits
- **Auth**: simple JWT (sha256 pw hash) per user choice ("هرکدام بهتر و بهینه‌تر / فعلاً نیاز به سیستم خاصی نیست")

## User Personas (Localized Roles)
- ادمین سازمان (org admin) — full control
- طراح فرایند (process designer) — builds workflows/forms
- مدیر تیم (team manager) — approves tasks
- کارمند (employee) — initiates and completes tasks

## Test Credentials
See `/app/memory/test_credentials.md`. Sample org "سازمان نمونه راهکار" is seeded on startup.

## Implemented (Initial MVP — Feb 2026)
- ✅ Multi-tenant data model (org_id scoping on every resource).
- ✅ Auth: login, /auth/me, JWT.
- ✅ Workflows CRUD + publish + start instance (`/workflows`, `/workflows/:id`, `/workflows/:id/start`).
- ✅ Forms CRUD with block-based field types (`/forms`).
- ✅ Tasks list/detail/update with status transitions, priority, deadlines.
- ✅ Process instances + monitoring (`/processes`, `/processes/:id`).

### Iteration 2 — Conditional Logic Core (Feb 2026)
- ✅ **Tab field group** (`type: tabs`): selecting a tab reveals only that tab's children. Live in form preview AND in any rendered task form (full Notion-style nested experience).
- ✅ **Structured `visible_if` rule** on every field: `{ field_id, op, value }` with op ∈ {=, !=, >, <, >=, <=, contains, empty, not_empty}. Conditional badge appears on field card; live preview hides/shows on the fly.
- ✅ **Structured `condition` on workflow edges**: same shape as form visibility; visual edge rule builder lists controller fields from the source form node + synthetic `_task_status`.
- ✅ **Process execution engine** (`/app/backend/engine.py`): on task approve/done, walks outgoing edges, picks branch (conditional match wins; otherwise default edge), creates the next task(s). On task reject, short-circuits process to `rejected`.
- ✅ **Auto-trigger on workflow start**: `POST /api/workflows/{id}/start` immediately advances from trigger so the first downstream task appears in the assignee's inbox.
- ✅ Live preview panel in FormBuilder with reactive tab switcher + payload JSON viewer.
- ✅ Inbox now renders the full task form inline via `<FormRenderer>` (with conditional visibility live) and submits the form data with status.
- ✅ Seeded sample: «فرم درخواست خدمات (پشتیبانی)» — 5-tab service request form mirroring the screenshots provided by the user. «فرایند درخواست تنخواه» now demonstrates a conditional finance approval (`amount > 5,000,000` ⇒ second approval).
- ✅ Dashboard aggregate endpoint (counters, my_tasks, approvals, running, activities, AI recs).
- ✅ Comments on nodes / tasks / processes.
- ✅ Activity log.
- ✅ AI chat-to-process via Claude Sonnet 4.6 SSE streaming, extracts JSON workflow.
- ✅ Seed data (2 workflows: مرخصی + تنخواه, 2 forms, 4 tasks, 4 users, sample activities).

### Frontend Pages
- ✅ Login (right-hero, demo accounts, RTL, monochrome).
- ✅ Dashboard (bento grid).
- ✅ AI Chat-to-Process (streaming + workflow preview + "save & open in builder").
- ✅ Workflows List.
- ✅ Visual Workflow Builder (reactflow custom nodes + palette + inspector + inline comments + AI panel).
- ✅ Forms List.
- ✅ Form Builder (Notion-style block palette, drag/move via arrows, live preview).
- ✅ Task Inbox (Linear-style master/detail, filters, approve/reject, comments).
- ✅ Process Monitoring (status tree, SLA bottleneck counter, metrics).
- ✅ Mobile Quick-Approvals (`/mobile`, sticky bottom-sheet detail).

## Prioritized Backlog
- P1: Persian Jalali date picker in FormRenderer (currently uses native browser date input).
- P1: Call `rfInstance.fitView()` once on WorkflowBuilder mount for nicer initial framing.
- P1: Persist canvas node positions on drag end (currently saves only on click "ذخیره").
- P2: Guard `POST /api/workflows/{id}/start` against draft workflows.
- P2: Real-time websocket process state.
- P2: Role-based permissions enforcement on every endpoint (currently org-scoped only).
- P2: Notifications + email digests.
- P2: AND/OR rule composition (currently single-clause).

## Next Action Items
- Verify AI streaming end-to-end (Claude Sonnet 4.6 generation).
- Add screenshots / visual polish.
