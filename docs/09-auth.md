# ۹. احراز هویت، نقش‌ها و مجوزها

## مکانیزم احراز هویت

جریان از **JWT (JSON Web Token)** با امضای **HS256** استفاده می‌کند.

### پارامترهای JWT (Django)

```python
# در تنظیمات جنگو یا متغیرهای محیطی
JWT_ALG = "HS256"
JWT_TTL_HOURS = 24 * 14  # 14 روز اعتبار
SECRET_KEY = os.environ["SECRET_KEY"]  # کلید اصلی جنگو
```

### Payload توکن

```json
{
  "sub": "user-uuid",     // user_id
  "org": "org-uuid",      // org_id
  "exp": 1234567890       // زمان انقضا
}
```

### هش رمز عبور

سیستم اکنون از مکانیزم‌های بومی رمزنگاری جنگو (`check_password` و `make_password`) با الگوریتم‌های استانداردتر استفاده می‌کند که امنیت را نسبت به هش خام SHA256 افزایش می‌دهد.

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

## استفاده از کاربر (Django REST Framework)

```python
# در تنظیمات:
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "core.auth.JWTAuthentication",
    ],
}

# در ویوها (Views):
from rest_framework.views import APIView

class WorkflowListView(APIView):
    def get(self, request):
        # request.user شامل اطلاعات کاربر است
        # request.user.org_id سازمان کاربر را مشخص می‌کند
        workflows = Workflow.objects.all() # به صورت خودکار توسط TenantManager فیلتر می‌شود
        return Response(...)
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

### بررسی نقش در Backend (DRF Permissions)

```python
# در ویوهای DRF از Permission سفارشی استفاده می‌شود:
from rest_framework.permissions import BasePermission

class IsOrgAdmin(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == "ادمین سازمان"
```

### عملیات محدود به ادمین

| عملیات | Endpoint |
|--------|---------|
| ایجاد کاربر | `POST /api/users/` |
| ویرایش نقش | `PATCH /api/users/{id}/` |
| حذف کاربر | `DELETE /api/users/{id}/` |
| ایجاد دپارتمان | `POST /api/departments/` |
| ویرایش دپارتمان | `PATCH /api/departments/{id}/` |
| حذف دپارتمان | `DELETE /api/departments/{id}/` |

### ایزولاسیون سازمان (TenantManager)

با معماری جنگو، تمام مدل‌ها از `TenantBaseModel` ارث می‌برند که باعث می‌شود به صورت **خودکار** هر query با `org_id` کاربر فیلتر شود.
این کار توسط Middleware و فیلترهای ORM به صورت شفاف (transparent) انجام می‌شود تا خطر نشت داده به صفر برسد.

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

> ⚠️ موارد زیر برای استقرار تولید باید اعمال شوند:

1. **Refresh Token**: توکن‌های کوتاه‌مدت + refresh (می‌توانید از `SimpleJWT` خود جنگو در آینده استفاده کنید)
2. **Role-Based Access Control کامل**: استفاده فراگیر از سیستم مجوزهای DRF (Permissions) در همه ViewSet‌ها
3. **Rate Limiting**: استفاده از throttling در DRF
4. **HTTPS اجباری**: در production همه traffic باید HTTPS باشد (تنظیم `SECURE_SSL_REDIRECT = True`)
5. **Audit Log**: ادامه ثبت دقیق دسترسی‌های حساس در `ActivityLog`
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
