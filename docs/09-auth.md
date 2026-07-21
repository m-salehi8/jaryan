# ۹. احراز هویت، نقش‌ها و مجوزها

## مکانیزم احراز هویت

جریان از **JWT (JSON Web Token)** با امضای **HS256** استفاده می‌کند.

### پارامترهای JWT

```python
JWT_ALG = "HS256"
JWT_TTL_HOURS = 24 * 14  # 14 روز اعتبار
JWT_SECRET = os.environ["JWT_SECRET"]  # از متغیر محیطی
```

### Payload توکن

```json
{
  "sub": "user-uuid",     // user_id
  "org": "org-uuid",      // org_id
  "exp": 1234567890       // زمان انقضا
}
```

### رمز عبور

```python
# هش ساده SHA256 (برای demo - production باید bcrypt باشد)
def hash_password(plain: str) -> str:
    return hashlib.sha256(plain.encode("utf-8")).hexdigest()
```

---

## جریان احراز هویت

```
۱. کاربر → POST /api/auth/login {email, password}
۲. سرور → verify_password(plain, stored_hash)
۳. اگر معتبر → make_token(user.id, user.org_id)
۴. پاسخ → {token: "eyJ...", user: {...}}
۵. Browser → localStorage.setItem("jaryan_token", token)
۶. هر request بعدی → Authorization: Bearer <token>
۷. Backend → decode_token → get_current_user → User object
```

---

## Dependency Injection

```python
# در auth.py:
CurrentUser = Depends(get_current_user)

# استفاده در routes:
@api.get("/workflows")
async def list_workflows(user: User = CurrentUser):
    # user حالا اطلاعات کاربر تأیید شده را دارد
    return db.workflows.find({"org_id": user.org_id})
```

---

## نقش‌ها و مجوزها

### ۴ نقش سیستم

| نقش | انگلیسی | سطح دسترسی |
|-----|---------|------------|
| ادمین سازمان | Org Admin | کامل |
| طراح فرایند | Process Designer | طراحی workflow/form |
| مدیر تیم | Team Manager | تایید تسک‌ها |
| کارمند | Employee | تکمیل تسک |

### بررسی نقش در Backend

```python
# بررسی دستی در هر endpoint:
if user.role != "ادمین سازمان":
    raise HTTPException(status.HTTP_403_FORBIDDEN, "insufficient_permissions")
```

### عملیات محدود به ادمین

| عملیات | Endpoint |
|--------|---------|
| ایجاد کاربر | `POST /api/users` |
| ویرایش نقش | `PATCH /api/users/{id}` |
| حذف کاربر | `DELETE /api/users/{id}` |
| ایجاد دپارتمان | `POST /api/departments` |
| ویرایش دپارتمان | `PATCH /api/departments/{id}` |
| حذف دپارتمان | `DELETE /api/departments/{id}` |

### ایزولاسیون سازمان

**هر** query به دیتابیس با `org_id` فیلتر می‌شود:

```python
# درست:
db.tasks.find({"org_id": user.org_id, "id": task_id})

# هرگز بدون org_id:
# db.tasks.find({"id": task_id})  ← خطر نشت داده بین سازمان‌ها
```

---

## Frontend Auth

### `AuthContext` (`lib/auth.js`)

```javascript
// Provider:
<AuthProvider>
  {children}
</AuthProvider>

// استفاده:
const { user, loading, login, logout } = useAuth();

// ورود:
const user = await login("admin@jaryan.ir", "admin1234");

// خروج:
logout(); // پاک کردن token + redirect

// بررسی ادمین:
import { isAdmin } from "@/lib/auth";
if (isAdmin(user)) { /* ... */ }
```

### ذخیره‌سازی Token

```javascript
// کلیدهای localStorage:
TOKEN_KEY = "jaryan_token"       // توکن اصلی
USER_KEY = "jaryan_user"         // cache کاربر

// Legacy keys (backward compat):
"raahkar_token"
"raahkar_user"
```

### Route Guards

```javascript
// RequireAuth: کاربر باید login کرده باشد
function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/login" />;
  return children;
}

// AdminRoute: کاربر باید ادمین باشد
function AdminRoute({ children }) {
  const { user } = useAuth();
  if (!isAdmin(user)) return <Navigate to="/" />;
  return children;
}

// RedirectIfAuthed: کاربر login‌شده به داشبورد redirect می‌شود
function RedirectIfAuthed({ children }) {
  const { user } = useAuth();
  if (user) return <Navigate to={isAdmin(user) ? "/admin" : "/"} />;
  return children;
}
```

---

## Axios Interceptor

```javascript
// در lib/api.js:
api.interceptors.request.use((config) => {
  const t = getToken();
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});
```

تمام درخواست‌های `api` به صورت خودکار Authorization header دارند.

---

## نقاط بهبود پیشنهادی (Security)

> ⚠️ موارد زیر برای production باید اعمال شوند:

1. **bcrypt به جای SHA256**: برای هش رمز عبور امن‌تر
2. **Refresh Token**: توکن‌های کوتاه‌مدت + refresh
3. **Role-Based Access Control کامل**: بررسی نقش در تمام endpoints (نه فقط user management)
4. **Rate Limiting**: محدودیت تعداد درخواست
5. **HTTPS اجباری**: در production همه traffic باید HTTPS باشد
6. **Audit Log**: لاگ تمام دسترسی‌های حساس

---

## مثال کامل جریان احراز هویت

```bash
# ۱. ورود
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@jaryan.ir", "password": "admin1234"}'

# خروجی:
# {"token": "eyJhbGciOiJIUzI1NiJ9...", "user": {...}}

# ۲. استفاده از توکن
TOKEN="eyJhbGciOiJIUzI1NiJ9..."

curl http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer $TOKEN"

# ۳. دسترسی به داده‌ها
curl http://localhost:8000/api/workflows \
  -H "Authorization: Bearer $TOKEN"

# ۴. خطای احراز هویت نشده
curl http://localhost:8000/api/workflows
# {"detail": "missing_token"}

# ۵. خطای دسترسی کافی نیست (کارمند به user management)
curl -X POST http://localhost:8000/api/users \
  -H "Authorization: Bearer $EMPLOYEE_TOKEN" \
  -d '{"email": "test@test.com", ...}'
# {"detail": "insufficient_permissions"}
```
