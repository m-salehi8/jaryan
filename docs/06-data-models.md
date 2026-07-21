# ۶. مدل‌های داده

## BaseDocument

پایه همه document‌های MongoDB:

```python
class BaseDocument(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)
    
    id: str = Field(default_factory=new_id)          # UUID4 string
    created_at: str = Field(default_factory=now_iso) # ISO datetime UTC
    updated_at: str = Field(default_factory=now_iso) # ISO datetime UTC
    
    def to_mongo(self) -> dict[str, Any]
    def from_mongo(cls, doc) -> Optional[BaseDocument]
```

> **نکته:** همه document‌ها از `id` (string UUID) به جای `_id` (ObjectId) MongoDB استفاده می‌کنند.

---

## Organization

```python
class Organization(BaseDocument):
    name: str      # "سازمان نمونه جریان"
    slug: str      # "jaryan-demo"
```

**Collection:** `organizations`

---

## User

```python
class User(BaseDocument):
    org_id: str              # شناسه سازمان
    email: EmailStr          # آدرس ایمیل
    full_name: str           # نام و نام خانوادگی
    role: RoleFa             # نقش (یکی از ۴ مقدار)
    password_hash: str       # SHA256 رمز عبور
    avatar_color: str = "#737373"        # رنگ hex
    department_id: Optional[str] = None  # شناسه دپارتمان
    manager_id: Optional[str] = None     # شناسه مدیر مستقیم
```

**RoleFa Enum:**
```python
RoleFa = Literal[
    "ادمین سازمان",
    "طراح فرایند",
    "مدیر تیم",
    "کارمند",
]
```

**Collection:** `users`  
**Index توصیه‌شده:** `{email: 1}`, `{org_id: 1}`

### UserPublic (DTO بدون password_hash)
```python
class UserPublic(BaseModel):
    id: str
    org_id: str
    email: EmailStr
    full_name: str
    role: RoleFa
    avatar_color: str
    department_id: Optional[str] = None
    manager_id: Optional[str] = None
```

---

## Department

```python
class Department(BaseDocument):
    org_id: str
    name: str                           # "واحد فناوری اطلاعات"
    parent_id: Optional[str] = None     # شناسه دپارتمان والد
    manager_id: Optional[str] = None    # شناسه مدیر
```

**Collection:** `departments`

---

## Workflow

```python
class Workflow(BaseDocument):
    org_id: str
    name: str
    description: str = ""
    status: Literal["draft", "published", "archived"] = "draft"
    trigger_type: Literal["manual", "cron"] = "manual"
    cron_expression: Optional[str] = None    # e.g. "0 9 * * 1-5"
    last_triggered_at: Optional[str] = None  # آخرین بار trigger شده
    nodes: list[WorkflowNode] = []
    edges: list[WorkflowEdge] = []
    created_by: str                          # user_id
```

**Collection:** `workflows`

### WorkflowNode

```python
class WorkflowNode(BaseModel):
    id: str
    type: Literal["trigger", "task", "approval", "condition", "form", "end", "ai_task", "ocr_task"]
    label: str
    position: dict          # {"x": 100, "y": 200}
    data: dict = {}         # تنظیمات اضافه هر نوع نود
    dependencies: list[str] = []              # node IDs که باید قبلاً تکمیل شوند
    timeout_seconds: Optional[int] = None
    timeout_action: Optional[Literal["escalate_to_manager", "auto_reject", "none"]] = "none"
    retry_count: Optional[int] = None
    retry_delay: Optional[int] = None
```

**فیلدهای `data` بسته به نوع نود:**

| نوع | فیلدهای `data` |
|-----|----------------|
| `task` | `assignee_type`, `assignee_role`, `assignee_id`, `form_id`, `field_permissions` |
| `approval` | `assignee_type`, `assignee_role`, `assignee_id` |
| `form` | `assignee_type`, `assignee_role`, `form_id` |
| `ai_task` | `system_prompt`, `output_key` |
| `ocr_task` | `source_file_variable`, `extraction_prompt`, `output_key` |
| `trigger` | (خالی) |
| `end` | (خالی) |

**مقادیر `assignee_type`:**
- `role` → `assignee_role` (یکی از RoleFa)
- `specific_user` → `assignee_id` (user UUID)
- `manager` → مدیر مستقیم شروع‌کننده فرایند
- `department_manager` → مدیر دپارتمان شروع‌کننده

### WorkflowEdge

```python
class WorkflowEdge(BaseModel):
    id: str
    source: str                          # node_id مبدا
    target: str                          # node_id مقصد
    label: Optional[str] = None
    condition: Optional[VisibilityRule] = None  # شرط عبور از این لبه
```

### VisibilityRule (شرط)

```python
class VisibilityRule(BaseModel):
    # Single-clause:
    field_id: Optional[str] = None
    op: Optional[Literal["=", "!=", ">", "<", ">=", "<=", "contains", "empty", "not_empty"]] = None
    value: Optional[str] = ""
    
    # Group (AND/OR):
    combinator: Optional[Literal["and", "or"]] = None
    conditions: Optional[list["VisibilityRule"]] = None
```

**مثال شرط ساده:**
```json
{ "field_id": "amount", "op": ">", "value": "5000000" }
```

**مثال شرط گروهی:**
```json
{
  "combinator": "and",
  "conditions": [
    { "field_id": "amount", "op": ">", "value": "5000000" },
    { "field_id": "department", "op": "=", "value": "IT" }
  ]
}
```

---

## Form

```python
class Form(BaseDocument):
    org_id: str
    name: str
    description: str = ""
    fields: list[FormField] = []
    created_by: str
```

**Collection:** `forms`

### FormField

```python
class FormField(BaseModel):
    id: str
    type: Literal["text", "textarea", "number", "date", "select",
                  "checkbox", "user", "file", "heading", "divider", "tabs"]
    label: str
    placeholder: str = ""
    required: bool = False
    options: list[str] = []          # برای select
    tab_options: list[TabOption] = [] # برای tabs
    parent_tab_field_id: Optional[str] = None  # اگر داخل tabs باشد
    parent_tab_id: Optional[str] = None
    visible_if: Optional[VisibilityRule] = None
    
    # Validation
    min_length: Optional[int] = None
    max_length: Optional[int] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    pattern: Optional[str] = None      # regex
    error_message: Optional[str] = None
```

---

## ProcessInstance

```python
class ProcessInstance(BaseDocument):
    org_id: str
    workflow_id: str
    workflow_name: str
    started_by: Optional[str] = None    # user_id یا None (cron)
    current_node_id: Optional[str] = None
    status: Literal["running", "completed", "rejected", "stuck"] = "running"
    completed_nodes: list[str] = []     # node_id هایی که تکمیل شده‌اند
    context: dict = {}                  # داده‌های جمع‌آوری‌شده از فرم‌ها
    workflow_snapshot: Optional[dict] = None  # {"nodes": [...], "edges": [...]}
```

**Collection:** `process_instances`

**وضعیت‌های status:**
| وضعیت | توضیح |
|-------|-------|
| `running` | در حال اجرا |
| `completed` | به node `end` رسیده |
| `rejected` | یک تسک رد شد |
| `stuck` | خطای AI/OCR غیرقابل برگشت |

---

## Task

```python
class Task(BaseDocument):
    org_id: str
    process_id: str
    workflow_id: str
    workflow_name: str
    node_id: str
    title: str                          # "نام نود — نام فرایند"
    assignee_id: Optional[str] = None   # user_id مشخص
    assignee_role: Optional[RoleFa] = None  # نقش (اگر assignee_id نداریم)
    type: Literal["task", "approval", "form"] = "task"
    status: Literal["waiting", "pending", "in_progress", "approved", "rejected", "done"] = "pending"
    wait_conditions: list[str] = []     # node_id هایی که باید تکمیل شوند
    priority: Literal["low", "medium", "high", "urgent"] = "medium"
    deadline: Optional[str] = None      # ISO datetime
    seen_time: Optional[str] = None     # اولین بار in_progress
    done_time: Optional[str] = None     # زمان تکمیل/تایید/رد
    form_id: Optional[str] = None
    form_data: dict = {}                # داده‌های فرم submit شده
    draft_data: dict = {}               # پیش‌نویس
    description: str = ""
    field_permissions: dict = {}        # {field_id: "editable"|"readonly"|"hidden"}
    escalated: bool = False             # آیا به مدیر escalate شده
    attempt_number: int = 1
```

**Collection:** `tasks`

**چرخه وضعیت:**
```
waiting → pending → in_progress → approved
                               → rejected
                               → done
```

---

## Comment

```python
class Comment(BaseDocument):
    org_id: str
    target_type: Literal["node", "task", "process"]
    target_id: str
    author_id: str
    author_name: str
    body: str
    mentions: list[str] = []    # user_id های منشن‌شده
```

**Collection:** `comments`

---

## ActivityLog

```python
class ActivityLog(BaseDocument):
    org_id: str
    actor_id: Optional[str] = None
    actor_name: str = ""
    action: str         # e.g. "task.approved", "workflow.created"
    target_type: str    # e.g. "task", "workflow"
    target_id: str
    summary: str = ""   # متن فارسی رویداد
```

**Collection:** `activities`  

**action‌های پیش‌فرض:**
- `user.created`, `user.mentioned`
- `workflow.created`
- `form.created`
- `process.started`
- `task.approved`, `task.rejected`, `task.done`
- `department.created`

---

## ChatMessage

```python
class ChatMessage(BaseDocument):
    org_id: str
    session_id: str
    user_id: str
    role: Literal["user", "assistant"]
    content: str
    generated_workflow: Optional[dict] = None  # workflow JSON تولید شده
```

**Collection:** `chat_messages`

---

## نمودار روابط

```
Organization (1) ──────────────── Users (N)
     │                                │
     │                                ├── Department (N) ──── Users
     │                                │
     ├── Workflows (N) ──────────────── ProcessInstances (N)
     │       │                                 │
     │       └── [nodes, edges]                └── Tasks (N)
     │                                                 │
     ├── Forms (N) ──────────────────────── Tasks.form_id
     │
     ├── Comments (N) [target: task/process/node]
     │
     ├── Activities (N)
     │
     └── ChatMessages (N) [session_id grouping]
```
