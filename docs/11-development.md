# ۱۱. راهنمای توسعه محلی

## راه‌اندازی محیط

### ۱. MongoDB

```bash
# Ubuntu
sudo systemctl start mongod
sudo systemctl status mongod

# بررسی اتصال
mongosh --eval 'db.adminCommand({ ping: 1 })'
# → { ok: 1 }
```

### ۲. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate

pip install -r requirements.txt

# فایل .env (اگر ندارید):
cat > .env << EOF
MONGO_URL=mongodb://localhost:27017
DB_NAME=jaryan
JWT_SECRET=dev-secret-change-in-prod
EMERGENT_LLM_KEY=sk-placeholder
CORS_ORIGINS=*
EOF

# اجرا
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

### ۳. Frontend

```bash
cd frontend
corepack enable  # اگر yarn ندارید
yarn install

REACT_APP_BACKEND_URL=http://localhost:8000 yarn start
# → http://localhost:3000
```

---

## اسکریپت سریع

```bash
# scripts/dev.sh
chmod +x scripts/dev.sh
./scripts/dev.sh
```

---

## ساختار توسعه

### اضافه کردن Endpoint جدید (Backend)

```python
# ۱. مدل Pydantic را در models.py تعریف کنید:
class MyNewModel(BaseDocument):
    org_id: str
    field1: str

class MyCreatePayload(BaseModel):
    field1: str

# ۲. Route را در server.py اضافه کنید:
@api.get("/my-resource")
async def list_my_resource(user: User = CurrentUser):
    rows = await db.my_collection.find(
        {"org_id": user.org_id}, {"_id": 0}
    ).to_list(1000)
    return rows

@api.post("/my-resource")
async def create_my_resource(payload: MyCreatePayload, user: User = CurrentUser):
    item = MyNewModel(org_id=user.org_id, field1=payload.field1)
    await db.my_collection.insert_one(item.to_mongo())
    return item
```

### اضافه کردن صفحه جدید (Frontend)

```javascript
// ۱. صفحه را بسازید: src/pages/MyPage.js
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function MyPage() {
  const [data, setData] = useState([]);
  
  useEffect(() => {
    api.get("/my-resource").then(r => setData(r.data));
  }, []);
  
  return <div>{/* ... */}</div>;
}

// ۲. Route را اضافه کنید: src/App.js
import MyPage from "@/pages/MyPage";
// داخل AdminLayout routes:
<Route path="my-page" element={<MyPage />} />

// ۳. لینک را به Sidebar اضافه کنید: components/AdminLayout.js
{ label: "صفحه جدید", icon: <SomeIcon />, path: "/admin/my-page" }
```

---

## Hot Reload

**Backend:** uvicorn با `--reload` تغییرات Python را real-time اعمال می‌کند.

**Frontend:** CRA با `yarn start` به صورت خودکار refresh می‌کند.

---

## دیتابیس در Development

### پاک کردن و seed مجدد

```bash
# پاک کردن دیتابیس
mongosh jaryan --eval "db.dropDatabase()"

# backend را restart کنید تا seed مجدد اجرا شود
# (seed فقط اگر organizations خالی باشد اجرا می‌شود)
```

### seed انبوه (برای تست)
```bash
cd backend
source .venv/bin/activate
python seed_heavy.py
```

### seed با AI workflow
```bash
python seed_ai_workflow.py
```

### مشاهده داده‌ها در MongoDB
```bash
mongosh jaryan
> show collections
> db.workflows.find().pretty()
> db.tasks.count()
> db.users.find({}, {password_hash: 0})
```

---

## لاگ‌ها

### Backend logs
```bash
# در ترمینال uvicorn:
INFO:jaryan:seed: {'skipped': True}
INFO:jaryan.engine:AI task completed
WARNING:jaryan.ai:EMERGENT_LLM_KEY is missing
```

### Frontend logs
```
# Browser DevTools → Console
# Network tab برای API calls
```

---

## کار با AI در Development

اگر `EMERGENT_LLM_KEY` ندارید:
- AI Chat به خطا می‌رسد (500)
- AI/OCR node‌ها در فرایند fail می‌شوند (stuck)
- سایر قابلیت‌ها کار می‌کنند

برای تست با یک کلید mock:
```env
EMERGENT_LLM_KEY=test-key-placeholder
```

---

## Code Style

### Python
```bash
# Formatting
black backend/
isort backend/

# Linting
flake8 backend/
mypy backend/
```

### JavaScript
```bash
# ESLint
cd frontend
npx eslint src/
```

---

## نکات مهم توسعه

### 1. Multi-Tenant
همیشه `org_id` را از `user.org_id` بگیرید — هرگز از body درخواست.

### 2. ISO Datetime
از `now_iso()` استفاده کنید نه `datetime.now()` مستقیماً.

### 3. MongoDB IDs
از `new_id()` (UUID4 string) استفاده کنید نه ObjectId.

### 4. Pydantic models
هر document باید از `BaseDocument` ارث‌بری کند و از `to_mongo()` برای ذخیره استفاده کند.

### 5. Error handling
```python
# کد خطاهای استاندارد:
raise HTTPException(404, "item_not_found")      # snake_case
raise HTTPException(403, "insufficient_permissions")
raise HTTPException(409, "email_already_exists")
raise HTTPException(400, "cannot_delete_self")
```

### 6. SSE
برای endpoints که stream دارند، حتماً header `X-Accel-Buffering: no` را تنظیم کنید.

---

## ساختار پوشه ادامه‌دار

```
# اضافه کردن collection جدید:
backend/
  └── models.py        ← اضافه کردن Model
  └── server.py        ← اضافه کردن Routes
  └── db.py            ← db.new_collection قابل استفاده بدون تغییر

# اضافه کردن قابلیت AI:
backend/
  └── services/
      ├── ai_service.py  ← اضافه کردن متد
      └── prompts.py     ← اضافه کردن prompt
```
