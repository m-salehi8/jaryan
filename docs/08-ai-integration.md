# ۸. یکپارچه‌سازی هوش مصنوعی

## معرفی

جریان از هوش مصنوعی در چند جا استفاده می‌کند:
1. **AI Chat-to-Workflow**: تبدیل توصیف فارسی به workflow JSON
2. **AI Agent Node**: پردازش خودکار داده‌ها در جریان فرایند
3. **OCR Node**: استخراج داده از تصاویر با Vision API

---

## سرویس AI (`services/ai_service.py`)

### پیکربندی

```python
class AIService:
    api_key = os.environ.get("EMERGENT_LLM_KEY", "")
    base_url = os.environ.get("OPENAI_BASE_URL", "http://localhost:20128/v1")
    model = os.environ.get("OPENAI_MODEL", "cf/@cf/moonshotai/kimi-k2.5")
```

این سرویس از **emergentintegrations** برای ارتباط با LLM استفاده می‌کند که یک wrapper سازگار با OpenAI API است.

---

## متد `stream_workflow_generation`

```python
async def stream_workflow_generation(
    session_id: str, 
    message: str
) -> AsyncGenerator[str, None]
```

تولید workflow از توصیف فارسی به صورت streaming.

**System Prompt:** `WORKFLOW_GENERATOR_PROMPT` از `services/prompts.py`

**جریان داده:**
```
Client → POST /api/ai/generate-workflow
       ← SSE: TextDelta chunks (متن پاسخ)
       ← SSE event:done (JSON workflow)
```

**مثال کاربرد (frontend):**
```javascript
streamAI(
  "یک فرایند درخواست مرخصی با تایید مدیر بساز",
  sessionId,
  (delta) => setText(prev => prev + delta),  // onDelta
  (workflow) => setWorkflow(workflow),         // onDone
  (err) => setError(err)                       // onError
);
```

---

## متد `ask_ai_json`

```python
@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
async def ask_ai_json(
    session_id: str,
    system_prompt: str,
    user_message: str
) -> dict
```

دریافت پاسخ JSON از AI با retry خودکار (3 بار).

**ویژگی‌ها:**
- Retry با exponential backoff (2s → 4s → 8s)
- Parse خودکار JSON از پاسخ
- پشتیبانی از فرمت ````json ... ` `` و JSON خام

**مثال:**
```python
result = await ai_service.ask_ai_json(
    session_id=process_id,
    system_prompt="تو یک ارزیاب درخواست مالی هستی. JSON با کلیدهای approved و reason برگردان.",
    user_message="مبلغ: 8,000,000 تومان. دلیل: خرید تجهیزات"
)
# result = {"approved": True, "reason": "مبلغ در محدوده مجاز است"}
```

---

## متد `extract_data_from_image`

```python
@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
async def extract_data_from_image(
    image_data: str,  # base64 data URI یا URL
    prompt: str
) -> dict
```

استخراج داده ساختارمند از تصویر با Vision API.

**پشتیبانی:**
- `data:image/jpeg;base64,...`
- `https://...`
- `base64-string` (بدون prefix → به jpeg تبدیل می‌شود)

**مثال:**
```python
result = await ai_service.extract_data_from_image(
    image_data="data:image/jpeg;base64,...",
    prompt="اطلاعات فاکتور را استخراج کن: تاریخ، مبلغ، فروشنده"
)
# result = {"date": "1403/04/15", "amount": 5500000, "vendor": "شرکت الف"}
```

---

## System Prompt های ثابت

### `WORKFLOW_GENERATOR_PROMPT`

```
تو دستیار هوشمند سامانه جریان هستی؛ یک پلتفرم فارسی برای طراحی فرایند سازمانی.

وظیفه: کاربر یک درخواست به زبان طبیعی فارسی می‌دهد. تو باید:
1) یک پاسخ کوتاه و دوستانه فارسی بدهی
2) یک بلوک JSON دقیقاً با این فرمت:

{
  "name": "نام فرایند",
  "description": "توضیح کوتاه",
  "nodes": [...],
  "edges": [...]
}

قوانین:
- types فقط: trigger، task، approval، condition، form، end
- assignee_role: «ادمین سازمان»، «طراح فرایند»، «مدیر تیم»، «کارمند»
- موقعیت گره‌ها: خطی با فاصله ۲۶۰ پیکسل افقی
- همه نام‌ها فارسی
```

### `NODE_TASK_EVALUATOR_PROMPT`

```
You are an AI node in an organizational workflow.
Your task is to evaluate the provided input based on instructions and return strict JSON.
```

---

## آماده‌سازی AI Agent Node در Workflow

برای استفاده از AI در فرایند:

**تنظیمات node (در WorkflowBuilder):**
```json
{
  "type": "ai_task",
  "label": "ارزیابی هوشمند درخواست",
  "data": {
    "system_prompt": "تو یک ارزیاب درخواست خرید هستی. بر اساس اطلاعات زیر تصمیم بگیر:\nمبلغ: {{amount}}\nدلیل: {{reason}}\nJSON با کلیدهای: {approved: bool, risk_level: string, comment: string}",
    "output_key": "ai_decision"
  }
}
```

**استفاده در edge condition بعد از AI node:**
```json
{
  "condition": {
    "field_id": "ai_decision.approved",
    "op": "=",
    "value": "true"
  }
}
```

> ⚠️ **توجه:** متغیرهای nested مثل `{{ai_decision.score}}` از طریق `inject_variables` پشتیبانی می‌شوند.

---

## آماده‌سازی OCR Node در Workflow

**تنظیمات node:**
```json
{
  "type": "ocr_task",
  "label": "استخراج اطلاعات فاکتور",
  "data": {
    "source_file_variable": "{{invoice_image}}",
    "extraction_prompt": "اطلاعات فاکتور را به JSON با کلیدهای date, amount, vendor, items استخراج کن",
    "output_key": "invoice_data"
  }
}
```

> **پیش‌نیاز:** `invoice_image` باید قبلاً از یک فرم `file` field در context ذخیره شده باشد.

---

## SSE (Server-Sent Events) Protocol

```
Client                           Server
  │                                │
  ├── POST /api/ai/generate-workflow
  │                                │
  │     ← data: سلام\n\n           │
  │     ← data: این فرایند\n\n     │
  │     ← data: شامل...\n\n        │
  │                                │
  │     ← event: done              │
  │     ← data: {"name":"..."}\n\n │
  │                                │
```

**فرمت SSE:**
```
data: <متن chunk>\n\n
event: done\ndata: <json>\n\n
event: error\ndata: <error message>\n\n
```

**تبدیل newline:**
در `_sse_escape()`: `\n` در chunk → `\\n` در SSE data  
در frontend `streamAI()`: `\\n` در data → `\n` در UI

---

## خطاها و Retry

| خطا | رفتار |
|-----|-------|
| خطای شبکه | retry 3 بار با exponential backoff |
| JSON نامعتبر | `ValueError: Invalid JSON generated by AI` |
| AI timeout | process به وضعیت `stuck` می‌رود |
| مفتاح نامعتبر | هشدار در لاگ، درخواست fail می‌شود |

---

## تنظیم Provider دیگر

برای استفاده از OpenAI مستقیم:
```env
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o
EMERGENT_LLM_KEY=sk-...
```

برای Anthropic Claude:
```env
OPENAI_BASE_URL=https://api.anthropic.com/v1
OPENAI_MODEL=claude-sonnet-4-5
EMERGENT_LLM_KEY=sk-ant-...
```

(سازگاری بستگی به emergentintegrations دارد)
