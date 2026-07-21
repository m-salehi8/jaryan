# ۱۴. داده‌های اولیه (Seed Data)

## حساب‌های کاربری پیش‌فرض

| ایمیل | رمز عبور | نقش | توضیح |
|-------|---------|-----|-------|
| `admin@jaryan.ir` | `admin1234` | ادمین سازمان | دسترسی کامل |
| `designer@jaryan.ir` | `1234` | طراح فرایند | طراحی workflow/form |
| `manager@jaryan.ir` | `1234` | مدیر تیم | تایید تسک‌ها |
| `employee@jaryan.ir` | `1234` | کارمند | تکمیل تسک |

## سازمان نمونه

- **نام:** سازمان نمونه جریان
- **Slug:** jaryan-demo

---

## فرایندهای seed شده

### ۱. فرایند درخواست مرخصی
```
Trigger → تکمیل فرم (کارمند) → تایید مدیر تیم → پایان
```
- وضعیت: `published`
- نود ۱: trigger
- نود ۲: form (فرم درخواست مرخصی)
- نود ۳: approval (مدیر تیم)
- نود ۴: end

### ۲. فرایند درخواست تنخواه (با منطق شرطی)
```
Trigger → تکمیل فرم (کارمند) → تایید اول (مدیر تیم) → 
  اگر مبلغ > ۵,۰۰۰,۰۰۰: تایید دوم (ادمین) → پایان
  در غیر این صورت: مستقیم → پایان
```
- وضعیت: `published`
- دارای Edge condition: `{field_id: "amount", op: ">", value: "5000000"}`
- نقطه اثبات منطق شرطی

---

## فرم‌های seed شده

### ۱. فرم درخواست مرخصی
فیلدها:
- نام کارمند (text, required)
- تاریخ شروع (date, required)
- تاریخ پایان (date, required)
- نوع مرخصی (select: استحقاقی، استعلاجی، بدون حقوق)
- دلیل (textarea)

### ۲. فرم درخواست تنخواه
فیلدها:
- نام درخواست‌کننده (text, required)
- مبلغ (number, required) ← این فیلد در شرط edge استفاده می‌شود
- دلیل (textarea, required)
- شماره حساب (text)

---

## تسک‌های seed شده

۴ تسک نمونه در وضعیت `pending`:
1. **تایید مرخصی** — مرخصی علی احمدی (مدیر تیم)
2. **درخواست تنخواه** — پرداخت هزینه‌های دفتری (مدیر تیم)
3. **تکمیل فرم** — فرم درخواست خدمات (کارمند)
4. **بررسی اسناد** — مدارک استخدام جدید (ادمین)

---

## Activity Logs seed شده

- «فرایند درخواست مرخصی ایجاد شد»
- «فرایند درخواست تنخواه ایجاد شد»
- «فرم درخواست مرخصی ایجاد شد»
- «اجرای فرایند آغاز شد»

---

## Seed Scripts

### `seed.py` — اجرای خودکار هنگام startup

```python
async def seed() -> dict:
    # اگر از قبل وجود داشت skip کن
    if await db.organizations.count_documents({}) > 0:
        return {"skipped": True}
    
    # ایجاد organization
    # ایجاد 4 user
    # ایجاد 2 workflow
    # ایجاد 2 form
    # ایجاد 4 task
    # ایجاد activity logs
    
    return {"seeded": True}
```

### `seed_heavy.py` — داده‌های انبوه (دستی)

برای تست با داده‌های بیشتر:

```bash
cd backend
source .venv/bin/activate
python seed_heavy.py
```

شامل:
- ۱۰+ فرایند نمونه
- ۲۰+ تسک در وضعیت‌های مختلف
- ۵۰+ activity log
- داده‌های analytics واقعی‌گونه

### `seed_ai_workflow.py` — workflow با AI node (دستی)

```bash
python seed_ai_workflow.py
```

ایجاد یک workflow نمونه که شامل `ai_task` و `ocr_task` node است.

---

## Reset دیتابیس

```bash
# پاک کردن همه چیز
mongosh jaryan --eval "db.dropDatabase()"

# یا پاک کردن فقط یک collection:
mongosh jaryan --eval "db.tasks.drop()"

# Restart backend برای seed مجدد
```

---

## بررسی Seed

```bash
mongosh jaryan --eval "
print('Organizations:', db.organizations.countDocuments());
print('Users:', db.users.countDocuments());
print('Workflows:', db.workflows.countDocuments());
print('Forms:', db.forms.countDocuments());
print('Tasks:', db.tasks.countDocuments());
"
```

خروجی مورد انتظار بعد از seed:
```
Organizations: 1
Users: 4
Workflows: 2
Forms: 2
Tasks: 4
```
