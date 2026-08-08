# ۶. مدل‌های داده

با مهاجرت به معماری هیبریدی، مدل‌های داده به دو بخش اصلی تقسیم شده‌اند:
۱. **مدل‌های رابطه‌ای (Django/PostgreSQL):** برای موجودیت‌های پایه‌ای مانند حساب‌ها، ساختار فرایندها، فرم‌ها و تسک‌ها.
۲. **مدل‌های سندی (MongoDB):** برای ProcessInstance و رویدادها که ماهیت حجیم و ساختار پویا دارند.

---

## بخش اول: مدل‌های رابطه‌ای (Django Models)

بیشتر این مدل‌ها از `TenantBaseModel` ارث می‌برند که فیلد `id` و `org` (سازمان) را فراهم می‌کند و فیلتر خودکار در سطح دیتابیس را تضمین می‌کند.

### Organization

```python
class Organization(models.Model):
    id = models.CharField(primary_key=True, default=uuid.uuid4, max_length=100)
    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True)
```

**Table:** `core_organization`

---

### User

```python
class User(AbstractBaseUser, PermissionsMixin, TenantBaseModel):
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=255)
    role = models.CharField(max_length=50, choices=ROLE_CHOICES)
    avatar_color = models.CharField(max_length=7, default="#737373")
    department = models.ForeignKey(Department, on_delete=models.SET_NULL, null=True, blank=True)
    manager = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True)
```

**RoleFa Enum:** "ادمین سازمان", "طراح فرایند", "مدیر تیم", "کارمند"

**Table:** `core_user`

---

### Department

```python
class Department(TenantBaseModel):
    name = models.CharField(max_length=255)
    parent = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='sub_departments')
    manager = models.ForeignKey('User', on_delete=models.SET_NULL, null=True, blank=True, related_name='managed_departments')
```

**Table:** `core_department`

---

### Workflow

```python
class Workflow(TenantBaseModel):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    trigger_type = models.CharField(max_length=50, default='manual')
    cron_expression = models.CharField(max_length=100, null=True, blank=True)
    last_triggered_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    
    # داده‌های ساختاری گراف به صورت JSON
    nodes = models.JSONField(default=list)
    edges = models.JSONField(default=list)
```

**Table:** `core_workflow`

ساختار `nodes` و `edges` درون JSONField همچنان از شمای زیر پیروی می‌کنند:

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

### Form

```python
class Form(TenantBaseModel):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    fields = models.JSONField(default=list)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
```

**Table:** `core_form`

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

### Task

```python
class Task(TenantBaseModel):
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('done', 'Done'),
    )
    workflow = models.ForeignKey(Workflow, on_delete=models.CASCADE)
    process_instance_id = models.CharField(max_length=255, help_text="MongoDB ProcessInstance ID")
    node_id = models.CharField(max_length=100)
    assigned_to = models.ForeignKey(User, on_delete=models.CASCADE)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    
    # داده‌های پویا
    form_data = models.JSONField(default=dict, blank=True)
    draft_data = models.JSONField(default=dict, blank=True)
    field_permissions = models.JSONField(default=dict, blank=True)
```

**Table:** `core_task`

---

## بخش دوم: مدل‌های سندی (MongoDB)

این مدل‌ها برای داده‌های بدون ساختار دقیق (مثل لاگ‌ها و Instance‌ها) استفاده می‌شوند:

### ProcessInstance

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
