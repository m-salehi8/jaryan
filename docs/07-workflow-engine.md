# ۷. موتور اجرای فرایند (Workflow Engine)

## مرور کلی

`engine.py` هسته اصلی پلتفرم جریان است. وظیفه آن:
1. **ارزیابی شروط** لبه‌های فرایند
2. **پیشروی** از نود فعلی به نودهای بعدی
3. **ایجاد تسک** برای نودهای قابل اجرا
4. **مدیریت timeout** و escalation
5. **شبیه‌سازی** فرایند بدون ذخیره در دیتابیس

---

## تابع `evaluate_rule`

```python
def evaluate_rule(rule: Optional[dict], context: dict) -> bool
```

ارزیابی یک شرط ساده یا مرکب در برابر context فرایند.

### ورودی‌ها

| پارامتر | نوع | توضیح |
|---------|-----|-------|
| `rule` | `dict \| None` | شرط (`VisibilityRule`) یا `None` |
| `context` | `dict` | داده‌های جمع‌آوری‌شده فرایند |

### منطق ارزیابی

```
rule == None → True (لبه پیش‌فرض)

rule.combinator == "and" → همه conditions باید True باشند
rule.combinator == "or"  → حداقل یک condition باید True باشد

rule.op:
  "="        → actual == value
  "!="       → actual != value
  ">"        → actual > value (numeric if possible)
  "<"        → actual < value
  ">="       → actual >= value
  "<="       → actual <= value
  "contains" → value in actual
  "empty"    → actual in (None, "", [], {})
  "not_empty"→ actual not in (None, "", [], {})
```

### متغیرهای synthetic در context

| کلید | مقدار | توضیح |
|------|-------|-------|
| `_task_status` | `"approved"` \| `"rejected"` \| `"done"` | وضعیت آخرین تسک |
| `requester` | نام کاربر | نام شروع‌کننده فرایند |

### مثال

```python
# شرط: اگر مبلغ بیش از ۵ میلیون بود
rule = {"field_id": "amount", "op": ">", "value": "5000000"}
context = {"amount": "7000000", "requester": "علی احمدی"}
evaluate_rule(rule, context)  # True

# شرط: تسک تایید شد
rule = {"field_id": "_task_status", "op": "=", "value": "approved"}
context = {"_task_status": "approved"}
evaluate_rule(rule, context)  # True
```

---

## تابع `advance_process`

```python
async def advance_process(
    *,
    process_id: str,
    completed_node_id: str,
    context_update: dict | None = None
) -> dict
```

اصلی‌ترین تابع engine. پس از تکمیل یک تسک، این تابع فرایند را به جلو می‌برد.

### الگوریتم BFS (Breadth-First Search)

```
1. بارگذاری process_instance از MongoDB
2. merge کردن context_update با context موجود
3. BFS از completed_node_id:
   
   برای هر node در frontier:
     → پیدا کردن لبه‌های خروجی
     → جداسازی: conditional vs default edges
     → انتخاب: conditional هایی که evaluate=True
     → اگر هیچ conditional نگذشت → default edges
     
     برای هر target node:
       → اگر type == "end": وضعیت "completed"
       → اگر type == "condition": فقط به frontier اضافه (pass-through)
       → اگر type == "ai_task": ask_ai_json() → ctx[output_key]
       → اگر type == "ocr_task": extract_data_from_image() → ctx[output_key]
       → اگر type در (task, approval, form):
           → بررسی dependencies (wait conditions)
           → ایجاد شیء Task در PostgreSQL (Django ORM)
           
4. ذخیره تسک‌های جدید (ORM) و لاگ در MongoDB
5. بروزرسانی process_instance در MongoDB (status, context, completed_nodes)
6. برگرداندن خلاصه تغییرات
```

### وضعیت‌های خروجی

| وضعیت | شرط |
|-------|-----|
| `running` | تسک‌های جدید pending ایجاد شد |
| `completed` | به node `end` رسید |
| `stuck` | خطای AI/OCR |

### مثال

```python
result = await advance_process(
    process_id="uuid-process",
    completed_node_id="node_approval",
    context_update={"_task_status": "approved", "note": "تایید شد"}
)
# → {"ok": True, "next_tasks": [...], "status": "running"}
```

---

## تابع `check_timeouts`

```python
async def check_timeouts() -> None
```

بررسی تسک‌هایی که مهلت آن‌ها گذشته و اعمال action مناسب.

### منطق

```
جستجو: تسک‌های منقضی شده با وضعیت pending با استفاده از Django ORM:
ORMTask.objects.filter(status="pending", created_at__lt=deadline)

برای هر تسک منقضی:
  → پیدا کردن workflow.nodes[task.node_id].timeout_action
  
  اگر "auto_reject":
    → ORMTask.objects.aupdate(status="rejected")
    → ثبت activity_log در MongoDB
    → advance_process(...)
  
  اگر "escalate_to_manager":
    → پیدا کردن manager_id از شروع‌کننده فرایند
    → ORMTask.objects.aupdate(assigned_to=new_assignee)
    → ثبت activity_log در MongoDB
  
  اگر "none":
    → هیچ کاری انجام نده
```

---

## تابع `inject_variables`

```python
def inject_variables(text: str, context: dict) -> str
```

جایگزینی متغیرهای `{{variable}}` در متن با مقادیر context.

```python
text = "درخواست از {{requester}} برای مبلغ {{amount}} تومان"
context = {"requester": "علی احمدی", "amount": "5000000"}
inject_variables(text, context)
# → "درخواست از علی احمدی برای مبلغ 5000000 تومان"

# مسیر تودرتو:
text = "نتیجه: {{ai_evaluation.score}}"
context = {"ai_evaluation": {"score": 85}}
inject_variables(text, context)
# → "نتیجه: 85"
```

---

## تابع `simulate_workflow`

```python
async def simulate_workflow(workflow: dict, mock_context: dict) -> list[dict]
```

شبیه‌سازی کامل فرایند بدون هیچ write به دیتابیس. برای تست منطق فرایند.

### خروجی (traces)

```python
[
  {
    "node_id": "n1",
    "time_taken_ms": 15,
    "result": {"action": "simulated_manual_completion"},
    "status": "success",
    "context_snapshot": {"requester": "Test", ...}
  },
  {
    "node_id": "n2",
    "time_taken_ms": 3200,
    "result": {"ai_output": {"score": 85, "approved": True}},
    "status": "success",
    "context_snapshot": {...}
  }
]
```

### توجه
- اگر AI task با خطا مواجه شود، simulation متوقف می‌شود
- Task های manual به صورت خودکار "approved" در نظر گرفته می‌شوند

---

## Node Dependencies (تسک‌های موازی)

جریان از parallel execution پشتیبانی می‌کند. اگر نودی `dependencies` داشت، تا تکمیل همه وابستگی‌ها در وضعیت `waiting` می‌ماند:

```json
{
  "id": "n5",
  "type": "task",
  "label": "بررسی نهایی",
  "dependencies": ["n3", "n4"]  // هر دو نود ۳ و ۴ باید تکمیل شوند
}
```

**منطق wait_conditions:**
```python
# وضعیت wait_conditions با استفاده از بررسی dependencies از process.completed_nodes انجام می‌شود
existing_task = await ORMTask.objects.filter(
    process_instance_id=process_id, node_id=target_id, status__in=["pending", "waiting"]
).afirst()
# اگر missing_deps خالی شود، status تسک به pending تغییر می‌کند.
```

---

## AI Task Node

وقتی engine به یک `ai_task` node می‌رسد:

```python
# خواندن تنظیمات از node.data:
system_prompt_template = data.get("system_prompt", "")
output_key = data.get("output_key", "ai_evaluation")

# جایگزینی متغیرهای context در system_prompt:
system_prompt = inject_variables(system_prompt_template, ctx)

# فراخوانی AI:
ai_result = await ai_service.ask_ai_json(
    session_id=process_id,
    system_prompt=system_prompt,
    user_message="Execute the task based on the provided context and return JSON."
)

# ذخیره نتیجه در context:
ctx[output_key] = ai_result
# فرایند بدون ایجاد تسک دستی ادامه می‌یابد
```

---

## OCR Task Node

```python
# خواندن تنظیمات:
source_file_variable = data.get("source_file_variable", "")  # e.g. "{{uploaded_file}}"
extraction_prompt = data.get("extraction_prompt", "")
output_key = data.get("output_key", "ocr_result")

# خواندن تصویر از context (base64 یا URL):
image_data = inject_variables(source_file_variable, ctx).strip()

# فراخوانی Vision API:
ai_result = await ai_service.extract_data_from_image(
    image_data=image_data,
    prompt=extraction_prompt
)

ctx[output_key] = ai_result
```

---

## نمودار گردش engine

```
PATCH /tasks/{id} (status=approved/done)
          │
          ▼
  advance_process(process_id, node_id, context_update)
          │
          ▼
  بارگذاری process + workflow (یا snapshot)
          │
          ▼
  merge context
          │
          ▼
  BFS از completed_node_id
  ┌────────────────────────────────┐
  │  لبه‌های خروجی را پیدا کن      │
  │  conditional → evaluate_rule  │
  │  default (اگر هیچ نگذشت)      │
  │                               │
  │  برای هر target_node:         │
  │    end? → completed           │
  │    condition? → frontier push │
  │    ai_task? → ask_ai_json     │
  │    ocr_task? → extract_image  │
  │    task/approval/form?        │
  │      → check dependencies     │
  │      → create ORMTask object  │
  └────────────────────────────────┘
          │
          ▼
  ORMTask.objects.acreate(...)
          │
          ▼
  update process_instance (status, context, completed_nodes)
          │
          ▼
  return {ok, next_tasks, status}
```
