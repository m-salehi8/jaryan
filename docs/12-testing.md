# ۱۲. راهنمای تست

## ساختار تست‌ها

```
backend/tests/
├── conftest.py       ← تنظیمات pytest و fixtures
└── backend_test.py   ← تست‌های End-to-End API
```

---

## پیکربندی (`conftest.py`)

```python
BASE_URL = "http://localhost:8000"

# Fixtures:
@pytest.fixture(scope="session")
def session():
    return requests.Session()

@pytest.fixture(scope="session")
def admin_token(session):
    r = session.post(f"{BASE_URL}/api/auth/login", 
                     json={"email": "admin@jaryan.ir", "password": "admin1234"})
    return r.json()["token"]

# همچنین: designer_token, manager_token, employee_token

def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
```

---

## اجرای تست‌ها

### پیش‌نیاز
Backend باید روی `localhost:8000` در حال اجرا باشد و seed شده باشد.

```bash
cd backend
source .venv/bin/activate

# اجرای همه تست‌ها
pytest tests/ -v

# اجرای یک کلاس تست
pytest tests/backend_test.py::TestWorkflows -v

# اجرای یک تست خاص
pytest tests/backend_test.py::TestAuth::test_login_success -v

# با لاگ کامل
pytest tests/ -v --log-cli-level=DEBUG

# با گزارش کوتاه
pytest tests/ -q
```

---

## دسته‌های تست

### `TestHealth`
```
✓ test_root — بررسی {"ok": true, "app": "jaryan"}
```

### `TestAuth`
```
✓ test_login_success (parametrized با 4 حساب)
✓ test_login_invalid — رمز اشتباه → 401
✓ test_me — اطلاعات کاربر جاری
✓ test_me_missing_token — بدون توکن → 401
```

### `TestDashboard`
```
✓ test_dashboard_shape — بررسی کلیدها (counters, my_tasks, ...)
✓ test_dashboard_manager_has_approvals — pending_approvals >= 0
```

### `TestWorkflows`
```
✓ test_list_seeded — وجود workflow های seed شده
✓ test_detail — جزئیات workflow
✓ test_create_and_update_and_start — ایجاد، بروزرسانی، شروع فرایند
✓ test_publish_and_run — publish و اجرا
✓ test_conditional_branching — منطق شرطی (تنخواه > ۵ میلیون)
```

### `TestForms`
```
✓ test_list_forms — لیست فرم‌های seed شده
✓ test_create_form — ایجاد فرم با فیلد text
✓ test_update_form — بروزرسانی فرم
```

### `TestTasks`
```
✓ test_list_tasks — لیست تسک‌ها
✓ test_task_detail — جزئیات تسک
✓ test_task_approve_flow — جریان تایید + advance_process
✓ test_task_reject_flow — جریان رد + وضعیت rejected
```

### `TestSearch`
```
✓ test_search_tasks — جستجو در تسک‌ها
✓ test_search_empty — عبارت کم‌تر از ۲ کاراکتر → 422
```

### `TestAnalytics`
```
✓ test_analytics_dashboard — فرمت داده‌های analytics
✓ test_analytics_users — آمار کاربران
```

### `TestComments`
```
✓ test_add_and_list_comments — افزودن و لیست کامنت
```

### `TestUsers` (Admin only)
```
✓ test_list_users — لیست کاربران سازمان
✓ test_create_user — ایجاد کاربر جدید
✓ test_create_user_duplicate_email — ایمیل تکراری → 409
✓ test_non_admin_cannot_create_user → 403
✓ test_delete_user — حذف کاربر
✓ test_cannot_delete_self → 400
```

---

## نوشتن تست جدید

```python
class TestMyFeature:
    def test_my_endpoint(self, session, admin_token):
        # ۱. ارسال درخواست
        r = session.get(
            f"{BASE_URL}/api/my-endpoint",
            headers=auth_headers(admin_token)
        )
        
        # ۲. بررسی status code
        assert r.status_code == 200, r.text
        
        # ۳. بررسی داده
        data = r.json()
        assert "expected_key" in data
        assert data["count"] >= 0
    
    def test_permission_denied(self, session, employee_token):
        r = session.post(
            f"{BASE_URL}/api/admin-only",
            headers=auth_headers(employee_token),
            json={"data": "test"}
        )
        assert r.status_code == 403
```

---

## تست Integration با فرایند کامل

```python
def test_full_workflow_run(session, admin_token, employee_token, manager_token):
    """تست یک فرایند کامل از شروع تا پایان"""
    
    # ۱. ساخت فرایند
    wf = session.post(f"{BASE_URL}/api/workflows",
        headers=auth_headers(admin_token),
        json={
            "name": "فرایند تست",
            "nodes": [
                {"id": "n1", "type": "trigger", "label": "شروع", "position": {"x": 0, "y": 0}, "data": {}},
                {"id": "n2", "type": "task", "label": "تسک کارمند", "position": {"x": 260, "y": 0}, 
                 "data": {"assignee_role": "کارمند"}},
                {"id": "n3", "type": "end", "label": "پایان", "position": {"x": 520, "y": 0}, "data": {}}
            ],
            "edges": [
                {"id": "e1", "source": "n1", "target": "n2"},
                {"id": "e2", "source": "n2", "target": "n3"}
            ]
        }).json()
    
    # ۲. publish
    session.patch(f"{BASE_URL}/api/workflows/{wf['id']}",
        headers=auth_headers(admin_token),
        json={"status": "published"})
    
    # ۳. شروع فرایند
    process = session.post(f"{BASE_URL}/api/workflows/{wf['id']}/start",
        headers=auth_headers(employee_token)).json()
    assert process["advanced"]["status"] == "running"
    
    # ۴. تکمیل تسک
    tasks = session.get(f"{BASE_URL}/api/tasks?assigned_to_me=true",
        headers=auth_headers(employee_token)).json()
    task = next(t for t in tasks if t["workflow_id"] == wf["id"])
    
    result = session.patch(f"{BASE_URL}/api/tasks/{task['id']}",
        headers=auth_headers(employee_token),
        json={"status": "done"}).json()
    
    assert result["advanced"]["status"] == "completed"
```

---

## تست‌های ناموفق رایج

### ۱. `ConnectionRefusedError`
**علت:** Backend در حال اجرا نیست  
**حل:** `uvicorn server:app --reload --port 8000`

### ۲. `assert len(rows) >= 2` fail
**علت:** دیتابیس seed نشده  
**حل:** Backend را restart کنید تا seed اجرا شود

### ۳. `401` در test
**علت:** Token منقضی شده (بعد از 14 روز)  
**حل:** حساب‌های test همیشه از نو login می‌کنند → مشکل نیست

### ۴. تست advance_process timeout
**علت:** AI service کند یا در دسترس نیست  
**حل:** اطمینان از `EMERGENT_LLM_KEY` معتبر یا mock کردن

---

## CI/CD (پیشنهادی)

```yaml
# .github/workflows/test.yml
name: Backend Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      mongodb:
        image: mongo:7.0
        ports:
          - 27017:27017
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: "3.11"
      
      - name: Install deps
        run: |
          cd backend
          pip install -r requirements.txt
      
      - name: Start backend
        run: |
          cd backend
          export MONGO_URL=mongodb://localhost:27017
          export DB_NAME=jaryan_test
          export JWT_SECRET=test-secret
          export EMERGENT_LLM_KEY=test-key
          uvicorn server:app &
          sleep 5
      
      - name: Run tests
        run: |
          cd backend
          pytest tests/ -v
```
