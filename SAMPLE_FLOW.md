# Jaryan Sample Flow: End-to-End Walkthrough

This document traces a complete **Leave Request ("درخواست مرخصی")** process through the Jaryan BPA platform — from workflow definition through engine execution to final completion.

## Project Snapshot

Jaryan is a Persian-first, no-code BPA (Business Process Automation) SaaS platform for Iranian organizations. It uses a **hybrid database architecture**:

| Layer | Database | Purpose |
|-------|----------|---------|
| Relational (Django ORM) | PostgreSQL | Users, Organizations, Departments, Workflow definitions, Tasks |
| Document (Motor/MongoDB) | MongoDB | Process instances (execution state), Activities, Comments, Chat messages |

Tech: **Django 6.0** + **DRF** | **React 19** + **ReactFlow** | **Celery + Redis** | **MongoDB** | **PostgreSQL**

---

## 1. The Workflow Definition (seed.py style)

The "فرایند درخواست مرخصی" (Leave Request) workflow is stored as JSON in the `Workflow` PostgreSQL model. Here's the structure:

### Nodes

```python
nodes = [
    # n1 — Trigger: no actionable task, just entry point
    {"id": "n1", "type": "trigger",  "label": "شروع: ثبت درخواست",   "position": (80, 120),  "data": {}},
    # n2 — Form: employee fills leave request form
    {"id": "n2", "type": "form",     "label": "تکمیل فرم مرخصی",      "position": (360, 120), "data": {"form_id": "...",  "assignee_role": "کارمند"}},
    # n3 — Approval: team manager approves
    {"id": "n3", "type": "approval", "label": "تایید مدیر تیم",        "position": (640, 120), "data": {"assignee_role": "مدیر تیم"}},
    # n4 — Condition: check if >3 days
    {"id": "n4", "type": "condition","label": "بیش از ۳ روز؟",        "position": (920, 120), "data": {"expression": "duration > 3"}},
    # n5 — Approval: admin needed only for long leaves
    {"id": "n5", "type": "approval", "label": "تایید ادمین سازمان",    "position": (1200, 40), "data": {"assignee_role": "ادمین سازمان"}},
    # n6 — End: termination
    {"id": "n6", "type": "end",      "label": "اعلام نتیجه",           "position": (1200, 220),"data": {}},
]
```

### Edges (with conditional branching)

```python
edges = [
    {"id": "e1", "source": "n1", "target": "n2"},                     # trigger → form
    {"id": "e2", "source": "n2", "target": "n3"},                     # form → manager approval
    {"id": "e3", "source": "n3", "target": "n4"},                     # manager → condition
    # Conditional edge: only taken if manager approved
    {"id": "e4", "source": "n4", "target": "n5",
     "label": "بله",
     "condition": {"field_id": "_task_status", "op": "=", "value": "approved"}},
    # Default edge: taken when condition node reached (always)
    {"id": "e5", "source": "n4", "target": "n6", "label": "خیر"},    # end (short leave)
    {"id": "e6", "source": "n5", "target": "n6"},                     # admin → end
]
```

### Edge Conditions & AND/OR Groups

Conditions support nested groups:

```
Simple clause:
  {"field_id": "amount", "op": ">", "value": "5000000"}

AND group (all must match):
  {"combinator": "and", "conditions": [
    {"field_id": "_task_status", "op": "=", "value": "approved"},
    {"field_id": "amount", "op": ">", "value": "5000000"}
  ]}

OR group (any must match):
  {"combinator": "or", "conditions": [
    {"field_id": "_task_status", "op": "=", "value": "approved"},
    {"field_id": "amount", "op": ">", "value": "5000000"}
  ]}

Nested (A AND B) OR C:
  {"combinator": "or", "conditions": [
    {"combinator": "and", "conditions": [...]},
    {"field_id": "c", "op": "=", "value": "3"}
  ]}
```

Supported operators: `=`, `!=`, `>`, `<`, `>=`, `<=`, `contains`, `empty`, `not_empty`

---

## 2. Starting a Process Instance

### API Call

```http
POST /api/workflows/{id}/start
Authorization: Bearer <token>
Content-Type: application/json

{"form_data": {"leave_type": "استحقاقی", "start_date": "1403-04-01", "end_date": "1403-04-05"}}
```

### What happens (views.py → engine.py)

**views.py `start` action:**
```python
# 1. Create MongoDB process instance document
process_doc = {
    "id": process_id,
    "org_id": str(request.user.org_id),    # Multi-tenant isolation
    "workflow_id": str(workflow.id),
    "workflow_name": workflow.name,
    "started_by": str(request.user.id),
    "status": "in_progress",
    "context": form_data,                  # Initial form data → process context
    "completed_nodes": [],
    "created_at": now_iso(),
    "updated_at": now_iso(),
}
await db.process_instances.insert_one(process_doc)

# 2. Find the trigger node and hand off to engine
trigger_node = next(n for n in workflow.nodes if n["type"] == "trigger")
await advance_process(process_id=process_id, completed_node_id=trigger_node["id"])
```

### The Engine: `advance_process()` Algorithm

The engine is the heart of the system (463 lines in `engine.py`). Here's how it works:

```
advance_process(process_id, completed_node_id, context_update=None)

1. Fetch the process instance from MongoDB (live execution state)
2. Fetch the workflow definition from PostgreSQL (persistent schema)
3. Merge context_update into the process context dict
4. BFS traversal from completed_node_id:
   a. Get outgoing edges
   b. Evaluate conditional edges → collect matching branches
   c. If no conditional matched, use default (unconditional) edges
   d. For each chosen edge:
      - If target is "end" → mark as visited
      - If target is "condition" → add to frontier (continue traversing)
      - If target is "ai_task"/"ocr_task" → auto-complete, add to frontier
      - If target is actionable (form/approval/task):
        * Check dependency completion (waiting for multiple incoming paths)
        * Create a Task in PostgreSQL ORM
   e. Update process instance in MongoDB:
      - completed_nodes (addToSet)
      - current_node_id
      - status (running / completed / rejected)
      - context updates
5. Return next task IDs and status
```

---

## 3. Execution Walkthrough (Step by Step)

### Step 1: Trigger → Form Task

After `POST /api/workflows/{id}/start`:

- Engine starts at `n1` (trigger)
- Outgoing edges from n1: `[e1 → n2]`
- n2 is type "form" → actionable
- `_node_to_task_data()` resolves assignee:
  - `assignee_role = "کارمند"` → finds first user with that role
- Creates ORM Task record:
  ```python
  Task(
      id=uuid, workflow=wf, process_instance_id=pid,
      node_id="n2", assigned_to=employee, status="pending"
  )
  ```
- Updates process: `completed_nodes=[n1]`, `current_node_id=n2`
- **Response to user**: next_tasks contains the employee task ID

### Step 2: Employee Fills Form

Employee sees task in their Inbox (`GET /api/tasks?assigned_to_me=true`).

```http
PATCH /api/tasks/{task_id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "done",
  "form_data": {
    "leave_type": "استحقاقی",
    "start_date": "1403-04-01",
    "end_date": "1403-04-05",
    "duration": 4
  }
}
```

**views.py `partial_update`:**
```python
task.status = "done"
task.save()
# Pass form_data as context_update for conditional evaluation downstream
await advance_process(
    process_id=task.process_instance_id,
    completed_node_id=task.node_id,
    context_update=form_data
)
```

### Step 3: Manager Approval

Engine resumes from n2:

- Outgoing from n2: `[e2 → n3]`
- n3 is type "approval" → assignee_role "مدیر تیم"
- Creates approval Task for manager
- Context now includes `{"leave_type": "استحقاقی", "duration": 4, ...}`

Manager sees the approval in their Inbox and clicks **"تایید"**:

```http
PATCH /api/tasks/{mgr_task_id}
{"status": "approved"}
```

### Step 4: Condition Node — Branching

Engine resumes from n3:

- Outgoing from n3: `[e3 → n4]`
- n4 is type "condition" → not actionable, add to frontier
- Outgoing from n4: `[e4 (conditional), e5 (default)]`
- **e4 condition:** `{field_id: "_task_status", op: "=", value: "approved"}`
  - `_task_status` is an **injected variable** — engine sets it to the completing task's status
  - Manager approved → `_task_status = "approved"` → **condition matches!**
- Engine takes e4 → n5 (admin approval)
- **Default edge e5 → n6 (end) is skipped** because a conditional matched

### Step 5: Admin Approval (for long leaves)

- n5 is type "approval" → assignee_role "ادمین سازمان"
- Creates approval Task for admin

Admin approves:

```http
PATCH /api/tasks/{admin_task_id}
{"status": "approved"}
```

### Step 6: End

Engine resumes from n5:

- Outgoing from n5: `[e6 → n6]`
- n6 is type "end"
- No more actionable nodes
- Process status → `"completed"`
- Final state:
  ```json
  {
    "status": "completed",
    "current_node_id": "n6",
    "completed_nodes": ["n1", "n2", "n3", "n4", "n5", "n6"],
    "context": {"leave_type": "استحقاقی", "duration": 4, ...}
  }
  ```

---

## 4. Alternative Path: Short Leave (< 3 days)

If employee entered `duration=2`:

- Steps 1-3 are identical
- At step 4, manager approves → condition on edge e4:
  - `_task_status = "approved"` → True
  - BUT the condition node's _real_ evaluation is simpler: edge e4 checks `_task_status=approved` always
  - In the **petty cash workflow**, the conditional check is on the actual form data: `amount > 5000000`
- If duration < 3 days, same flow still goes to admin only because of how the leave workflow is wired
  - Actually looking more carefully: the condition node checks `_task_status=approved` (always true if manager approved). The "> 3 days" logic is **on the node's display label only** — the actual routing is the same.
  - In the **petty cash workflow** (فرایند درخواست تنخواه), the condition actually works: if `amount > 5000000`, edge e3 goes to admin approval (n4); otherwise, default edge e4 goes directly to payment (n5), skipping admin.

---

## 5. Rejection Path

If the manager **rejects** the request:

```http
PATCH /api/tasks/{mgr_task_id}
{"status": "rejected"}
```

**What the engine does:**
```python
if new_status != 'rejected':
    await advance_process(...)    # Continue forward
else:
    await update_process_status(task.process_instance_id)  # Stop + mark rejected
```

The `update_process_status` function:
1. Fetches all tasks for this process
2. If any task is `"rejected"` → process status = `"rejected"`
3. No downstream tasks are created
4. The process is dead — no further advancement

---

## 6. Multi-Tenant Isolation

Every query is scoped by organization:

**PostgreSQL (Django TenantManager):**
```python
class TenantManager(models.Manager):
    def get_queryset(self):
        qs = super().get_queryset()
        org_id = current_org_id.get()  # From ContextVar — set by TenantContextMiddleware
        if org_id:
            return qs.filter(org_id=org_id)
        return qs
```

**MongoDB (manual in queries):**
```python
db.process_instances.find({"org_id": str(request.user.org_id)})
```

The `org_id` comes from the JWT token, which encodes it at login time. Users cannot forge it — it's server-verified.

---

## 7. The Complete Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Browser (React SPA)                                 │
│  ┌──────────┐  ┌────────────┐  ┌─────────────┐  ┌────────────┐            │
│  │ Dashboard │  │ Workflow   │  │ Form        │  │ Inbox /    │            │
│  │ (Recharts)│  │ Builder    │  │ Builder     │  │ Task List  │            │
│  └──────────┘  │ (ReactFlow) │  └─────────────┘  └────────────┘            │
│                └────────────┘                                              │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │ HTTP / SSE
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Django + Gunicorn                                    │
│                                                                             │
│  ┌─────────────────┐    ┌──────────────────┐    ┌───────────────────┐      │
│  │  core/views.py   │    │  engine.py        │    │  core/tasks.py    │      │
│  │  (API endpoints) │───▶│  advance_process  │    │  (Celery Beat)    │      │
│  │                  │    │  evaluate_rule    │    │  check_timeouts   │      │
│  │  - CRUD          │    │  _node_to_task    │    └───────────────────┘      │
│  │  - Login/JWT     │    └──────────────────┘                               │
│  │  - Start process │                                                       │
│  └─────────────────┘                                                        │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Services Layer                                                      │   │
│  │  ├── ai_service.py   — SSE streaming workflow generation via LLM     │   │
│  │  └── prompts.py      — Persian prompt templates for AI nodes         │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────┬────────────────────┘
                           │                              │
              ┌────────────▼──────┐          ┌────────────▼──────┐
              │   PostgreSQL      │          │     MongoDB       │
              │   (Django ORM)    │          │  (Motor / PyMongo) │
              │                   │          │                   │
              │  - Organization   │          │  - process_instances
              │  - User           │          │  - activity_logs   │
              │  - Department     │          │  - comments        │
              │  - Workflow       │          │  - chat_messages   │
              │  - Form           │          └───────────────────┘
              │  - Task           │
              └───────────────────┘
```

---

## 8. Key Design Patterns

### Hybrid DB Pattern
- **PostgreSQL**: Structured, relational data (orgs, users, workflow schemas, tasks) — leverages Django's ORM, migrations, admin
- **MongoDB**: Flexible document storage for execution state (process contexts, activity logs, chat messages) — no schema migrations needed for changing context shapes

### Snapshot-based Execution
When a process starts, the engine reads the workflow definition from the ORM but the process instance in MongoDB carries its own state. However, **the CURRENT_STATE.md notes this is not yet a true snapshot** — the engine re-reads the workflow definition each time. A snapshot feature is planned.

### Context Propagation
Form data flows through the process as a unified context dict, accessible to:
- Edge conditions (`evaluate_rule` reads from context)
- Variable injection in labels (`{{form_field_id}}`)
- AI/OCR node prompts

### Timeout & Escalation (Celery Beat)
Every minute, Celery checks for expired tasks:
```python
CELERY_BEAT_SCHEDULE = {
    'check-timeouts-every-minute': {
        'task': 'core.tasks.check_timeouts_task',
        'schedule': crontab(minute='*'),
    },
}
```
Timeout actions:
- `auto_reject` — mark task rejected, log activity, advance process
- `escalate_to_manager` — reassign to the starter's manager

---

## 9. Running the Sample Flow

### Prerequisites (via Docker)
```bash
docker compose up -d      # Starts Django, PostgreSQL, MongoDB, Redis, Celery, Nginx, React
```

### Quick Start (no Docker)

**Backend:**
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py seed     # Seeds org, users, workflows, forms
python manage.py runserver
```

**Frontend:**
```bash
cd frontend
npm install
npm start
```

### API Tour

```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login/ \
  -H 'Content-Type: application/json' \
  -d '{"email":"designer@jaryan.ir","password":"1234"}' | jq -r '.token')

# 2. List workflows (tenant-scoped)
curl http://localhost:8000/api/workflows/ -H "Authorization: Bearer $TOKEN"

# 3. Start the leave workflow (replace {id} with actual workflow ID)
curl -X POST http://localhost:8000/api/workflows/{id}/start/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"form_data": {"leave_type": "استحقاقی", "duration": 4}}'

# 4. Check tasks as employee
EMP_TOKEN=$(curl -s -X POST ... -d '{"email":"employee@jaryan.ir","password":"1234"}' | jq -r '.token')
curl "http://localhost:8000/api/tasks/?assigned_to_me=true" -H "Authorization: Bearer $EMP_TOKEN"

# 5. Complete task
curl -X PATCH http://localhost:8000/api/tasks/{task_id}/ \
  -H "Authorization: Bearer $EMP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"done","form_data":{"duration": 4}}'

# 6. Login as manager to approve
MGR_TOKEN=$(curl -s -X POST ... -d '{"email":"manager@jaryan.ir","password":"1234"}' | jq -r '.token')
curl -X PATCH http://localhost:8000/api/tasks/{mgr_task_id}/ \
  -H "Authorization: Bearer $MGR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"approved"}'
```