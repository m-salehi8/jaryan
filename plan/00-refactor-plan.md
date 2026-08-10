# پلن بازسازی و پاک‌سازی پروژه جریان

> تاریخ تدوین: ۱۴۰۵/۰۵/۱۹ (2026-08-10)
> مبنا: بررسی کامل کد در تاریخ فوق. تمام مسیرها و شماره‌خط‌ها در زمان تدوین صحت‌سنجی شده‌اند.
>
> **آخرین صحت‌سنجی: ۱۴۰۵/۰۵/۱۹ (2026-08-10)** — تمام ۶۵ آیتم در برابر کد واقعی بررسی شدند.
> علامت `[x]` یعنی در کد تأیید شد. علامت `⚠️ فقط working tree` یعنی اصلاح انجام شده ولی **کامیت نشده** و در `HEAD` هنوز باگ وجود دارد.
> شماره‌خط‌های داخل متن آیتم‌ها مربوط به زمان تدوین‌اند و بعضی جابه‌جا شده‌اند؛ مرجع، یادداشت صحت‌سنجی هر آیتم است.

## خلاصه صحت‌سنجی

| فاز | انجام‌شده | باقی‌مانده |
|---|---|---|
| ۰ — پیش‌نیاز | ۰ از ۳ | هر سه باز (۰.۱ نیمه) |
| ۱ — باگ‌های بحرانی | ۵ از ۸ | ۱.۶، ۱.۷، ۱.۸ |
| ۲ — یکپارچه‌سازی بک‌اند | ۲ از ۱۳ | بیشتر پورت‌ها و کل حذف کد مرده |
| ۳ — نقش‌ها | منسوخ | تصمیم پایه عوض شده — سیستم ۲ نقشی تثبیت شد |
| ۴ — تکمیل قابلیت‌ها | ۳ از ۱۲ | ۴.۱ تا ۴.۴ و ۴.۶ همچنان باز |
| ۵ — پاک‌سازی | ۰ از ۱۷ | دست‌نخورده |
| ۶ — مستندات | ۰ از ۵ | دست‌نخورده |

**بحرانی‌ترین یافته:** تمام اصلاحات امنیتی فاز ۱ (۱.۳، ۱.۴، ۱.۵) و کل لایه مجوزها فقط در working tree هستند و کامیت نشده‌اند. ضمناً `frontend/src/lib/workflowUtils.js` که اصلاحات ۱.۱ و ۱.۲ در آن است، به‌خاطر الگوی `lib/` در `.gitignore:77` اصلاً در گیت نیست — یک clone تازه build نمی‌شود.

## تصمیم‌های پایه

سه تصمیم که کل این پلن بر آن‌ها استوار است:

۱. **Django می‌ماند، FastAPI حذف می‌شود.** قابلیت‌هایی که فقط در FastAPI پیاده شده‌اند به Django پورت می‌شوند.
۲. **سیستم نقش‌ها به ۴ نقش گسترش می‌یابد**: ادمین سازمان، طراح فرایند، مدیر تیم، کارمند.
۳. **دامنه کار**: رفع باگ‌های بحرانی + حذف کد مرده و وابستگی‌های بلااستفاده + تکمیل قابلیت‌های نیمه‌کاره.

بهداشت ریپو و امنیت زیرساخت (PostHog، `.env` در گیت، هدرهای امنیتی nginx) خارج از دامنه انتخاب‌شده است و در پیوست «الف» فقط فهرست شده تا فراموش نشود.

---

## وضعیت فعلی در یک نگاه

پروژه یک پلتفرم اتوماسیون فرایند سازمانی فارسی‌اول است که میانه یک مهاجرت ناتمام از FastAPI به Django گیر کرده. `engine.py` در جای خود بازنویسی شده تا از Django ORM استفاده کند، و همین کار زنجیره وابستگی FastAPI را قطع کرده است. نتیجه: حدود ۱۲۵۰ خط کد در `server.py` که **حتی import هم نمی‌شود**، به‌همراه تست‌ها، زمان‌بند cron و کل قابلیت‌های AI که با آن از کار افتاده‌اند. سمت Django تقریباً دو‌سوم سطح API را بازپیاده کرده و بقیه را stub گذاشته است.

مشکل اصلی این نیست که کد بد است — ساختار هر دو سمت تمیز و منظم است. مشکل این است که **چیزهای زیادی ساخته شده‌اند ولی وصل نشده‌اند**: CommandPalette کامل است و mount نمی‌شود، `uiContext` نوشته شده و import نمی‌شود، `QueryClientProvider` نصب است و استفاده نمی‌شود، prop `users` به Inspector پاس داده نمی‌شود، و badgeهای SLA درست رندر می‌شوند ولی فیلد `deadline` در مدل Django اصلاً وجود ندارد.

---

## فاز ۰ — بررسی‌های پیش‌نیاز

این فاز قبل از هر تغییری انجام شود چون ممکن است اولویت بقیه کار را عوض کند.

- [ ] **۰.۱ — بررسی اینکه `frontend/src/lib/` اصلاً در گیت هست یا نه.**
  **صحت‌سنجی: نیمه‌انجام.** `git ls-files frontend/src/lib/` حالا ۱۰ فایل برمی‌گرداند، ولی `workflowUtils.js` همچنان نادیده گرفته می‌شود (`git check-ignore -v` → `.gitignore:77 lib/`). چهار فایل *tracked* آن را import می‌کنند: `WorkflowBuilder.js:28`، `SimpleWorkflowBuilder.js:14`، `Inspector.js:10`، `useWorkflowManager.js:5`. **یک clone تازه build نمی‌شود.** الگوهای `bin/` (خط ۷۵)، `data/` (۷۶) و `lib/` (۷۷) هنوز اصلاح نشده‌اند.
  در `.gitignore` خط ۷۷ الگوی `lib/` بدون اسلش ابتدایی آمده، که با **هر** پوشه‌ای به نام `lib` در هر عمقی مطابقت می‌کند — از جمله `frontend/src/lib/` که `auth.js`، `api.js`، `sla.js`، `templates.js`، `badgeContext.js`، `jalali.js` و `workflowUtils.js` در آن هستند.
  ```bash
  git ls-files frontend/src/lib/
  ```
  اگر خروجی خالی بود، این فایل‌ها در ریپو نیستند و یک clone تازه اصلاً build نمی‌شود. در آن صورت:
  ```bash
  git add -f frontend/src/lib/
  ```
  و الگوی `lib/` در `.gitignore` به `/node/lib/` (یا هر مقصود اصلی‌اش) محدود شود. الگوهای `bin/` (خط ۷۵) و `data/` (خط ۷۶) هم همین مشکل را دارند و باید بررسی شوند.

- [ ] **۰.۲ — یکسان‌سازی نسخه پایتون.**
  **صحت‌سنجی: انجام نشده و پیچیده‌تر از توصیف پلن.** `backend/.venv/pyvenv.cfg` نسخه `3.14.4` را اعلام می‌کند، `Dockerfile:1` روی `python:3.11-slim` قفل است، و venv خودش ناسازگار است — هر دو درخت `lib/python3.12/` و `lib/python3.14/` وجود دارند.
  venv موجود در `backend/.venv` پایتون **۳.۱۴** است، در حالی که `backend/Dockerfile:1` روی `python:3.11-slim` قفل شده. `django-unfold` روی ۳.۱۴ کرش می‌کند و پنل ادمین ۵۰۰ می‌دهد (`.logs/backend.log:29-110`). venv را با پایتون ۳.۱۱ بازبسازید:
  ```bash
  rm -rf backend/.venv && python3.11 -m venv backend/.venv
  source backend/.venv/bin/activate && pip install -r backend/requirements.txt
  ```
  این کار به‌تنهایی باگ پنل ادمین را حل می‌کند — نیازی به patch کردن unfold نیست.

- [ ] **۰.۳ — ساخت برنچ کاری و گرفتن snapshot از دیتابیس.**
  **صحت‌سنجی: انجام نشده.** برنچ فعلی `main` است و فقط `main` و `origin/main` وجود دارند. تمام کار فاز ۱ مستقیم روی `main` انجام شده، بدون برنچ و بدون snapshot. یک `stash@{0}` روی `9f94508` موجود است.
  فازهای ۲ و ۳ شامل migration و حذف فایل هستند. یک برنچ جدا و یک نسخه پشتیبان از `backend/db.sqlite3` و دیتابیس Mongo لازم است.

---

## فاز ۱ — رفع باگ‌های بحرانی

این‌ها محصول را غیرقابل‌استفاده کرده‌اند. مستقل از بقیه فازها قابل انجام‌اند و باید اول انجام شوند.

- [x] **۱.۱ — رفع کرش سازنده فرایند.** *(مسدودکننده اصلی محصول)* — ⚠️ **فقط working tree، و فایل در گیت نیست**
  `frontend/src/lib/workflowUtils.js:2-12` هر نوع گره را فقط با `{label, description}` تعریف می‌کند، ولی `WorkflowBuilder.js:32,239` و `SimpleWorkflowBuilder.js:207,259` مقدار `meta.icon` را برداشته و به‌صورت `<Icon />` رندر می‌کنند. کامپوننت `undefined` استثنا پرتاب می‌کند. پالت گره‌ها در `WorkflowBuilder.js:238` بدون شرط رندر می‌شود، پس **`/admin/workflows/:id` در هر بار mount کرش می‌کند**.
  اقدام: افزودن `icon` (از lucide-react) و `bar` (کد رنگ) به تمام کلیدهای `NODE_TYPES_META`، و افزودن کلیدهای گمشده `form`، `approval` و `end` که تمپلیت‌ها و `Inspector.js:100` به آن‌ها متکی‌اند.
  **صحت‌سنجی:** انجام شد — `workflowUtils.js:30-109` هر ۱۳ کلید را با `icon` و `bar` دارد، شامل `form:49`، `approval:55`، `end:97`. تابع `getNodeMeta()` با `FALLBACK_NODE_TYPE` در `:115-123` اضافه شده و مصرف‌کننده‌ها به آن مهاجرت کرده‌اند (`WorkflowBuilder.js:31-32,40`، `SimpleWorkflowBuilder.js:206-207,217`).
  **باقی‌مانده:** حلقه‌های پالت هنوز مستقیم ایندکس می‌کنند و روی کلید ناشناخته کرش می‌کنند — `WorkflowBuilder.js:111`، `SimpleWorkflowBuilder.js:76,137`.

- [x] **۱.۲ — رفع ناسازگاری شکل گره بین API و ReactFlow.** — ⚠️ **فقط working tree، و فایل در گیت نیست**
  `toRF` و `fromRF` در `workflowUtils.js:14-27` تابع همانی‌اند و هیچ تبدیلی انجام نمی‌دهند، ولی دو شکل ناسازگار در سیستم وجود دارد: شکل API/تمپلیت `{id, type:"trigger", label, position}` در برابر شکل موردنیاز رندرر `{id, type:"custom", data:{label, nodeType}}`. نتیجه: هر فرایندی که از تمپلیت، از `WorkflowsList` یا از AI ساخته شود با `type` ثبت‌نشده باز می‌شود و `data.nodeType` آن `undefined` است.
  اقدام: پیاده‌سازی واقعی تبدیل دوطرفه در `toRF`/`fromRF`.
  **صحت‌سنجی:** انجام شد — `toRF` در `workflowUtils.js:138-164` نوع معنایی را به `type:"custom"` (یا نوع اختصاصی از `DEDICATED_RF_TYPES:112`) نگاشت می‌کند، `data.nodeType` را پر می‌کند و گره‌های از قبل تبدیل‌شده را در `:144-146` رد می‌کند. `fromRF:173-187` مسیر برگشت را دارد. واقعاً استفاده می‌شود: `useWorkflowManager.js:22,40,94,110` و `WorkflowBuilder.js:324`.

- [x] **۱.۳ — بستن حفره تأیید تسک توسط غیرمسئول.** *(امنیتی — بحرانی)* — ⚠️ **فقط working tree**
  `core/views.py:100` در `TaskViewSet.partial_update` هیچ بررسی‌ای نمی‌کند که درخواست‌دهنده همان `assigned_to` تسک باشد. **هر کاربر احرازهویت‌شده‌ای می‌تواند هر تسکی را با دانستن id آن تأیید یا رد کند.**
  اقدام: افزودن گارد مالکیت، و افزودن گارد idempotency مشابه `find_one_and_update` که نسخه FastAPI داشت (`server.py:507`) تا تأیید دوباره یک تسک، فرایند را دو بار جلو نبرد.
  **صحت‌سنجی:** انجام شد و فراتر از پلن — گارد مالکیت در `core/views.py:165-169` با ۴۰۳ `not_task_assignee`؛ idempotency به‌صورت UPDATE شرطی در `:179-181` با ۴۰۹ `already_processed` در `:182-186`؛ و rollback در صورت شکست موتور در `:207-225` با ۵۰۳. در `HEAD` هنوز همان `task.status = new_status; task.save()` ساده است.

- [x] **۱.۴ — بازگرداندن کنترل دسترسی مدیریتی.** *(امنیتی — بحرانی)* — ⚠️ **فقط working tree**
  `core/views.py:130` (`UserViewSet`) و `:135` (`DepartmentViewSet`) هر دو `ModelViewSet` خام با `IsAuthenticated` هستند. گیت‌های `if user.role != "مدیر": 403` که نسخه FastAPI داشت در پورت Django کاملاً حذف شده‌اند. **هر کارمندی می‌تواند کاربر بسازد یا حذف کند.**
  اقدام: نوشتن کلاس‌های permission در `core/permissions.py` و اعمال آن‌ها. این کار عمداً بعد از فاز ۳ (نقش‌ها) تکمیل می‌شود، ولی گارد موقتِ «فقط مدیر» همین حالا اضافه شود.
  **صحت‌سنجی:** انجام شد — `core/permissions.py` (۱۰۵ خط، untracked) با `IsOrgAdmin:33`، `IsOrgAdminOrReadOnly:47`، `IsDesignerOrReadOnly:67`، `IsDesigner:86`. اعمال‌شده روی `WorkflowViewSet:77` (با استثنای `start` در `:79-84`)، `UserViewSet:236`، `DepartmentViewSet:279`، `FormViewSet:288`، `AIProviderConfigViewSet:309`، و endpointهای AI در `:412,539`. `TaskViewSet:142` عمداً `IsAuthenticated` مانده چون گارد سطح‌شیء در ۱.۳ آن را پوشش می‌دهد. در `HEAD` هر پنج ویوست `IsAuthenticated` خام‌اند.

- [x] **۱.۵ — افزودن انقضا به توکن JWT.** *(امنیتی)* — ⚠️ **فقط working tree**
  `core/views.py:16-21` فقط `user_id` و `org_id` را encode می‌کند و claim مربوط به `exp` ندارد؛ **توکن‌ها هرگز منقضی نمی‌شوند** و شاخه `except jwt.ExpiredSignatureError` در `core/auth.py:21` دست‌نیافتنی است.
  اقدام: افزودن `exp`، و افزودن interceptor پاسخ در `frontend/src/lib/api.js` برای مدیریت سراسری ۴۰۱ (الان هیچ interceptor پاسخی وجود ندارد).
  **صحت‌سنجی:** انجام شد — `core/views.py:42` مقدار `JWT_TTL = timedelta(days=14)` و `make_token` هر دو claim `iat` و `exp` را در `:53-54` encode می‌کند. interceptor پاسخ ۴۰۱ در `frontend/src/lib/api.js:44-59` با گارد جلوگیری از حلقه ورود در `:49,51`.
  **صحت‌سنجی:** انجام شد — `views.py:42` مقدار `JWT_TTL = timedelta(days=14)` و `make_token` هر دو claim `iat` و `exp` را در `:53-54` encode می‌کند. interceptor پاسخ ۴۰۱ در `frontend/src/lib/api.js:44-59` با گارد حلقه لاگین در `:49,51`.

- [ ] **۱.۶ — رفع ناسازگاری واژگان وضعیت فرایند.**
  سه واژگان رقیب برای یک فیلد وجود دارد: `advance_process` مقدار `running` می‌نویسد (`engine.py:443`)، `core/views.py:61` مقدار `in_progress` می‌نویسد، و `dashboard_view:166` تعداد `in_progress` را می‌شمارد. یعنی **شمارنده «فرایندهای در جریان» داشبورد فرایندهایی را که موتور ساخته نمی‌بیند**.
  اقدام: انتخاب یک مجموعه واحد (پیشنهاد: `running | completed | rejected | stuck` مطابق مدل اصلی) و یک migration داده برای رکوردهای موجود در Mongo.
  **صحت‌سنجی: انجام نشده، ناسازگاری زنده است.** شماره‌خط‌ها جابه‌جا شده‌اند: موتور `running` را در `engine.py:514` (و پیش‌فرض `:520`) می‌نویسد و در `:525` ذخیره می‌کند؛ ساخت فرایند `in_progress` را در `core/views.py:117` می‌نویسد؛ `update_process_status` مقدار `in_progress` را در `engine.py:289,293` و `rejected` را در `:280` می‌نویسد؛ و `dashboard_view` فقط `in_progress` را در `views.py:570` می‌شمارد. ضمناً `stuck` در هیچ‌کجای `backend/` و `frontend/src/` وجود ندارد، پس مجموعه پیشنهادی پلن هنوز پیاده نشده.
  **صحت‌سنجی: انجام نشده — ناسازگاری همچنان زنده است.** `advance_process` مقدار `running` را در `engine.py:514` می‌نویسد (و پیش‌فرض `:520`)، ساخت فرایند `in_progress` را در `core/views.py:117`، و `update_process_status` مقدار `in_progress` را در `engine.py:289,293`. `dashboard_view:570` فقط `in_progress` را می‌شمارد. یعنی فرایندی که موتور جلو ببرد به `running` تغییر می‌کند و از شمارنده داشبورد بیرون می‌افتد. مقدار `stuck` هیچ‌جا در کد وجود ندارد.

- [ ] **۱.۷ — افزودن route فراگیر (catch-all) و ErrorBoundary.**
  `frontend/src/App.js` هیچ `<Route path="*">` ندارد؛ هر URL ناشناخته صفحه سفید می‌دهد. ضمناً هیچ‌کدام از دو سازنده فرایند داخل ErrorBoundary نیستند (فقط `Inbox.js:248` از آن استفاده می‌کند).
  **صحت‌سنجی: انجام نشده.** `App.js` روت‌های `:51` تا `:90` را دارد بدون هیچ wildcard و در working tree هم دست‌نخورده است. `components/ErrorBoundary.js` وجود دارد و tracked است ولی فقط `Inbox.js:248-429` و `ProcessTimeline.js:419-467` را می‌پوشاند — هیچ‌کدام از دو سازنده فرایند پوشش ندارند.
  **صحت‌سنجی: انجام نشده.** `App.js` هیچ wildcard ندارد (روت‌ها `:51` تا `:90`). `components/ErrorBoundary.js` وجود دارد ولی فقط `Inbox.js:248-429` و `ProcessTimeline.js:419-467` را می‌پوشاند؛ هیچ‌کدام از دو سازنده فرایند wrap نشده‌اند.

- [ ] **۱.۸ — رفع نبود مدیریت خطا در واکشی‌ها.**
  `Dashboard.js:36` بدون `.catch` است؛ در صورت خطا `data` روی `null` می‌ماند و `const c = data.counters` در خط ۶۰ TypeError می‌دهد. همین الگو در `FormsList.js:18` (بدون catch و بدون loading)، `Inbox.js:60,76`، `ProcessMonitoring.js:31-40,44` و `WorkflowsList.js:26` تکرار شده.
  **صحت‌سنجی: انجام نشده.** فراخوانی‌های `.finally` اسپینر را پاک می‌کنند ولی هیچ `.catch` خطا را نمی‌گیرد. دو واکشی در Inbox استثنا شده‌اند (`:71` و `:86`) و mutationها در `Inbox.js:139-151` و `WorkflowsList.js:52-55` try/catch دارند؛ بقیه موارد پابرجاست.
  **صحت‌سنجی: انجام نشده.** `.finally` اسپینر را پاک می‌کند ولی هیچ `.catch` خطا را نمی‌گیرد: `Dashboard.js:36` (و `:60` همچنان `null` را dereference می‌کند)، `FormsList.js:18`، `Inbox.js:60-66` و `:76`، `ProcessMonitoring.js:31-39` و `:44`، `WorkflowsList.js:26`. استثناها: `Inbox.js:71,86` و mutationهای `Inbox.js:139-151` و `WorkflowsList.js:52-55` هندلر دارند.

---

## فاز ۲ — یکپارچه‌سازی بک‌اند

هدف: یک بک‌اند، بدون کد مرده. **ترتیب مهم است** — اول پورت، بعد حذف.

### ۲الف — پورت قابلیت‌های گمشده به Django

این endpointها فقط در FastAPI وجود دارند و در Django اصلاً نیستند:

- [ ] **۲.۱ — `GET /api/search/`** — جستجوی سراسری در تسک‌ها، فرایندها و فرم‌ها. مرجع: `server.py:706`. حداکثر ۵ نتیجه از هر دسته، فیلتر `org_id`، حداقل ۲ کاراکتر.
  **صحت‌سنجی: انجام نشده — و مصرف‌کننده زنده دارد.** هیچ روت یا ویویی وجود ندارد. `components/CommandPalette.js:36` مقدار `api.get("/search", ...)` را صدا می‌زند → ۴۰۴.
- [ ] **۲.۲ — `GET /api/analytics/dashboard/`** — مرجع: `server.py:776`. شامل `daily_processes` (۳۰ روز شمسی)، `task_status_dist`، `top_users`، `avg_completion_minutes`.
  **صحت‌سنجی: انجام نشده — و مصرف‌کننده زنده دارد.** روت‌های موجود فقط `analytics/users/` (`urls.py:23`) و `analytics/forms/` (`:24`) هستند که هر دو stub خالی‌اند (`views.py:617-623`). روت `dashboard/` (`urls.py:21`) جداست و زیر `analytics/` نیست. `pages/Analytics.js:47` مقدار `/analytics/dashboard` را می‌خواهد → ۴۰۴.
- [ ] **۲.۳ — `GET /api/analytics/workflows/{id}/heatmap/`** و **`/api/analytics/workflow-distribution/`** — مرجع: `server.py:1007,1044`.
  **صحت‌سنجی: انجام نشده.** صفر تطابق برای `heatmap` و `workflow-distribution` در کل `core/` و `services/`. مصرف‌کننده فرانت هم ندارد، پس ۴۰۴ فعالی تولید نمی‌کند.
- [ ] **۲.۴ — `POST /api/tasks/{id}/draft/`** — ذخیره خودکار پیش‌نویس فرم. مرجع: `server.py:579`. فرانت‌اند در `Inbox.js:92-101` هر ۳ ثانیه این را صدا می‌زند.
  **صحت‌سنجی: انجام نشده — و فرانت هنوز poll می‌کند.** `TaskViewSet` (`views.py:139-229`) هیچ `@action` با نام `draft` ندارد، ولی `Inbox.js:96` داخل interval سه‌ثانیه‌ای (`:99`) به `/tasks/${active.id}/draft` POST می‌کند و `:85` مقدار `t.draft_data` را می‌خواند. **هر ۳ ثانیه به‌ازای هر تسک باز، یک ۴۰۴.**
- [x] **۲.۵ — `POST /api/ai/generate-workflow/`** (SSE) و **`GET /api/ai/sessions/{id}/`** — مرجع: `server.py:1141,1202`. جزئیات در فاز ۴. — ⚠️ **فقط working tree**
  **صحت‌سنجی:** انجام شد — `urls.py:28,29` (عمداً قبل از router ثبت شده‌اند تا `ai/providers` آن‌ها را سایه نیندازد، طبق کامنت `:26-27`)، ویوها در `views.py:411-473` با `StreamingHttpResponse` واقعی در `:467` و `views.py:538-554`. هر دو با `IsDesigner` محافظت شده‌اند.
- [x] **۲.۶ — گارد `status == "published"` هنگام شروع فرایند.** — ⚠️ **فقط working tree**
  **صحت‌سنجی:** انجام شد — `core/views.py:99-103` با خطای `workflow_not_published` و کد ۴۰۰.
- [ ] **۲.۷ — انتقال اعتبارسنجی DAG.** `models.py:153-187` یک validator تشخیص حلقه (DFS) دارد که فقط هنگام `status == "published"` اجرا می‌شود. مدل Django (`core/models.py:105`) گره‌ها را به‌صورت `JSONField` خام و بدون هیچ اعتبارسنجی ذخیره می‌کند. این validator باید به سریالایزر Django منتقل شود.
  **صحت‌سنجی: انجام نشده.** `WorkflowSerializer` در `core/serializers.py:61-65` هنوز `fields = '__all__'` خام بدون هیچ `validate_*` است. فایل جدید `services/workflow_validation.py` نوع گره، نقش و یال‌های معلق را اعتبارسنجی می‌کند ولی **تشخیص حلقه ندارد**، پس این آیتم را پوشش نمی‌دهد. تشخیص حلقه فقط در `backend/models.py:163-181` مرده باقی مانده.

### ۲ب — حذف کد مرده FastAPI

فقط پس از تکمیل ۲الف:

- [ ] **۲.۸ — حذف فایل‌ها**: `backend/server.py`، `backend/models.py`، `backend/db.py`، `backend/auth.py`، `backend/seed.py`، `backend/seed_heavy.py`، `backend/seed_ai_workflow.py`، `backend/test_cron.py`، ~~`backend/emergentintegrations/`~~.
  توجه: `services/ai_service.py` و `services/prompts.py` **حذف نمی‌شوند** — در فاز ۴ استفاده می‌شوند.
  **صحت‌سنجی: انجام نشده. ⚠️ اصلاح مهم در خود پلن: `emergentintegrations/` زنده است و نباید حذف شود** — `services/ai_service.py:28` از آن `LlmChat، UserMessage، TextDelta، StreamDone` را import می‌کند و خودش هم در working tree تغییر کرده. بقیه هشت فایل واقعاً مرده‌اند (جمعاً حدود ۳۳۴۳ خط) و فقط همدیگر را import می‌کنند؛ هیچ کد زنده Django به آن‌ها وابسته نیست. یک مصرف‌کننده مرده دیگر: `backend/generate_test_data.py:5-7` که از `generate_test_data.sh:3` صدا زده می‌شود. ارجاعات غیرپایتونی باقی‌مانده: `scripts/dev.sh:66,112` و `docker-compose.dev.yml:13`.
- [ ] **۲.۹ — حذف `backend/core/db_wrapper.py`** (۱۲۷ خط). این یک آداپتور شبیه‌ساز Mongo روی Django ORM بود که پس از بازنویسی `engine.py` بی‌مصرف شد. **هیچ importکننده‌ای ندارد.**
  **صحت‌سنجی: انجام نشده — ولی تشخیص پلن درست است.** فایل هنوز هست و صفر importکننده دارد. حذف امن.
- [ ] **۲.۱۰ — پاک‌سازی `engine.py`**: حذف importهای بلااستفاده `sync_to_async` و `Organization`.
  **صحت‌سنجی: نیمه — و بخش `inject_variables` منسوخ شد.** دو import هنوز بلااستفاده‌اند: `sync_to_async` (`engine.py:16`) و `Organization` (`:19`)، هر دو در `HEAD` هم همین‌طور. اما **`inject_variables` دیگر مرده نیست**: در `:30` تعریف و در `:78,79,84` داخل `_run_ai_node` جدید صدا زده می‌شود. وضعیت: منسوخ — گزینه «حذف شود» دیگر معتبر نیست.
- [ ] **۲.۱۱ — بازنویسی `scripts/dev.sh`.**
  **صحت‌سنجی: انجام نشده.** `scripts/dev.sh:66` هنوز `exec uvicorn server:app` است (و `:112` همان در پس‌زمینه)؛ فایل از کامیت `ca7b8f2` دست‌نخورده. جایگزین عملی یعنی `run.sh` (untracked) درست از `manage.py runserver` استفاده می‌کند (`run.sh:118,160`)، ولی `dev.sh` نه به‌روز شد و نه حذف.
- [ ] **۲.۱۲ — پاک‌سازی `requirements.txt`.**
  **صحت‌سنجی: انجام نشده.** فایل ۴۱ خطی دست‌نخورده است و **هر ۱۴ بسته نام‌برده هنوز فهرست‌اند**: fastapi(`:1`)، uvicorn(`:2`)، boto3(`:3`)، requests-oauthlib(`:4`)، pydantic(`:8`)، bcrypt(`:11`)، passlib(`:12`)، motor(`:14`)، python-jose(`:20`)، pandas(`:22`)، numpy(`:23`)، jq(`:25`)، typer(`:26`)، anthropic(`:27`). ابزار توسعه هنوز در `:16-19` مخلوط است و `requirements-dev.txt` وجود ندارد. فایل جدید `requirements-local.txt` (untracked) یک زیرمجموعه دستی و فقط-Django برای اجرای بدون کامپایلر است — راه‌حل موقت، جایگزین این آیتم نیست.
- [ ] **۲.۱۳ — یکسان‌سازی seedها.**
  **صحت‌سنجی: بدتر شد.** حالا **شش** نقطه ورود seed وجود دارد: `backend/seed.py`، `seed_heavy.py`، `seed_ai_workflow.py`، `generate_test_data.py` (چهار مورد مرده)، `core/management/commands/seed_hybrid_db.py` (کامیت‌شده) و `core/management/commands/seed.py` (**جدید، untracked**). یعنی seeder جدید اضافه شد ولی هیچ‌کدام حذف نشدند — از ۵ به ۶ رسید.

---

## فاز ۳ — مهاجرت به سیستم ۴ نقشی

> **وضعیت: منسوخ — تصمیم پایه شماره ۲ عوض شده.**
> کد در جهت مخالف حرکت کرده: به‌جای گسترش به ۴ نقش، سیستم **۲ نقشی تثبیت شد**. مهاجرت `core/migrations/0002_alter_user_role.py` (untracked) صراحتاً چهار نقش قدیمی دوران FastAPI را به دو نقش جمع می‌کند، و `services/workflow_validation.py:30-41` یک جدول ROLE_ALIASES دارد که نقش‌های اختراعی مدل زبانی (`ادمین سازمان`، `طراح فرایند`، `مدیر تیم`، `کارشناس`، `admin`، `manager`، …) را روی همان دو نقش می‌نشاند و ناشناخته‌ها را به `کارمند` برمی‌گرداند.
> `core/permissions.py:9-11` هم صراحتاً یادداشت کرده که گسترش دو→چهار نقشی هنوز یک *فاز آینده* است، نه واقعیت کد.
> آیتم‌های زیر تا وقتی این تصمیم بازبینی نشود اجرا نمی‌شوند. آیتم‌هایی که مستقل از تعداد نقش‌ها همچنان ارزش دارند (۳.۳، ۳.۴، ۳.۵) با یادداشت جدا مشخص شده‌اند.

جدول زیر مربوط به زمان تدوین است. **واقعیت فعلی:** `core/models.py:82-85` دقیقاً دو نقش دارد — `مدیر` و `کارمند`.

| منبع | نقش‌ها |
|---|---|
| `core/models.py:82-85` و `frontend/src/lib/auth.js:41` | ۲ نقش: `مدیر`، `کارمند` |
| `frontend/src/lib/templates.js` | ۴ نقش: `ادمین سازمان`، `طراح فرایند`، `مدیر تیم`، `کارمند` |
| `docs/01-overview.md` و `plan/requirements.md` | همان ۴ نقش |

**نتیجه فعلی: هر ۸ تمپلیت، تسک‌هایی تولید می‌کنند که به نقش‌هایی تخصیص داده شده‌اند که هیچ کاربری نمی‌تواند داشته باشد.**
**صحت‌سنجی: این باگ زنده است** — `lib/templates.js:35,47,61` مقدار `role: "مدیر تیم"` و `:48,49,62,63` مقدار `role: "ادمین سازمان"` می‌دهند. سمت بک‌اند `workflow_validation.py` این‌ها را نجات می‌دهد، ولی فقط برای فرایندهای ساخته‌شده با AI؛ مسیر تمپلیت پوشش ندارد.

- [ ] ~~**۳.۱ — گسترش `ROLE_CHOICES` در `core/models.py:82` به چهار نقش.**~~ منسوخ — دو نقش تثبیت شد (`core/models.py:82-85`، کامیت‌شده).
- [ ] ~~**۳.۲ — نوشتن migration داده.**~~ منسوخ — مهاجرت `0002_alter_user_role.py` در جهت عکس نوشته شد (state-only، بدون تغییر داده). untracked.
- [ ] **۳.۳ — بازنویسی `isAdmin` در `frontend/src/lib/auth.js:41`.** *(همچنان معتبر، مستقل از تعداد نقش‌ها)*
  **صحت‌سنجی: انجام نشده.** هنوز `user?.role === "مدیر"` است و هیچ ماژول مجوزی وجود ندارد — صفر تطابق برای `canManageUsers`/`canDesignWorkflow`/`canApprove` در کل فرانت.
- [ ] **۳.۴ — حذف بررسی‌های درون‌خطی تکراری نقش.** *(همچنان معتبر)*
  **صحت‌سنجی: انجام نشده.** `UserManagement.js:47` و `:67` هنوز رشته `"مدیر"` را مستقیم مقایسه می‌کنند (به‌علاوه کلید map در `:24`).
- [ ] **۳.۵ — به‌روزرسانی لیست نقش‌ها در UI از یک منبع واحد.** *(همچنان معتبر)*
  **صحت‌سنجی: انجام نشده.** `UserManagement.js:21` و `components/workflow/Inspector.js:12` هر دو `const ROLES = ["مدیر", "کارمند"]` را جدا hardcode کرده‌اند، و `lib/templates.js:4` یک واژگان چهارنقشی سوم دارد.
- [x] **۳.۶ — تکمیل کلاس‌های permission بک‌اند.** — ⚠️ **فقط working tree** — بر مبنای ۲ نقش پیاده شد، نه ۴. جزئیات در ۱.۴.
- [x] **۳.۷ — به‌روزرسانی `create_superuser` و seedها.**
  **صحت‌سنجی:** سازگار با دو نقش — `core/models.py:56` مقدار `'مدیر'` را پیش‌فرض می‌گذارد، `seed_hybrid_db.py:102,116` روی همان دو نقش شاخه می‌زند.
  ⚠️ **اشکال در seed جدید:** در `core/management/commands/seed.py:20-23` کاربر `designer@jaryan.ir` با برچسب «طراح فرایند» نقش `"کارمند"` می‌گیرد، در حالی که `DESIGNER_ROLES` در `permissions.py:26` فقط `مدیر` است — یعنی **حساب «طراح» نمی‌تواند فرایند طراحی کند**.

---

## فاز ۴ — تکمیل قابلیت‌های نیمه‌کاره

- [ ] **۴.۱ — بازگرداندن فیلدهای گمشده مدل `Task`.** *(پیش‌نیاز SLA)*
  **صحت‌سنجی: انجام نشده — خرابی خاموش SLA هنوز زنده است.** مدل Django در `core/models.py:135-157` همچنان هیچ‌کدام از این فیلدها را ندارد. `_node_to_task_data` در `engine.py:249-265` مقادیر `title`، `deadline`، `priority`، `escalated`، `attempt_number`، `assignee_role`، `form_id` را می‌سازد ولی `_create_task` در `engine.py:182-192` **هیچ‌کدام را ذخیره نمی‌کند** — فقط `form_data` و `field_permissions`. نتیجه همان است: `getSLAStatus(t.deadline, ...)` در `Inbox.js:283`، `Dashboard.js:155` و `ProcessMonitoring.js:92` همیشه `undefined` می‌گیرد و SLA مرده است. `check_timeouts` هم روی `updated_at__lt` کار می‌کند (`engine.py:167`) نه deadline واقعی.

- [ ] **۴.۲ — رفع مکانیزم اجرای موازی (join/dependency).**
  **صحت‌سنجی: انجام نشده — ناسازگاری فعال است.** شماره‌خط‌ها جابه‌جا شده‌اند ولی باگ همان است: `engine.py:475` فیلتر `status__in=["pending","waiting"]` را می‌زند، `:479-481` وضعیت `waiting` را به `pending` ارتقا می‌دهد و `:494` تسک جدیدی با `status="waiting"` می‌سازد — در حالی که `waiting` در `Task.STATUS_CHOICES` (`core/models.py:136-141`) مجاز نیست. مکانیزم انتظار همچنان بی‌اثر است.

- [ ] **۴.۳ — رفع حلقه بی‌پایان ارجاع به مدیر (escalation).**
  **صحت‌سنجی: انجام نشده — با یک پیچیدگی جدید.** `escalate_to_manager` در `engine.py:356-367` فقط `assigned_to` و `updated_at` را تغییر می‌دهد؛ نه فلگ `escalated` ست می‌شود و نه deadline تمدید. اما چون `check_timeouts` روی `updated_at__lt` کلید می‌خورد (`engine.py:167`)، همین آپدیتِ `updated_at` تصادفاً حلقه را می‌شکند — به بهای اینکه تسک escalate‌شده دیگر **هیچ‌وقت** timeout نخورد. نتیجه: باگ اول (حلقه) فرعی شده، ولی مکانیزم timeout روی تسک‌های escalate‌شده کلاً مرده است.

- [ ] **۴.۴ — راه‌اندازی زمان‌بند cron.**
  `trigger_type` و `cron_expression` در `core/models.py:114-115` ذخیره می‌شوند ولی **هیچ تسک Celery آن‌ها را ارزیابی نمی‌کند**. زمان‌بند FastAPI (`server.py:70`) با مرگ آن فایل از بین رفت و جایگزینی نداشت. `CELERY_BEAT_SCHEDULE` فقط `check_timeouts_task` را اجرا می‌کند. **فرایندهای زمان‌بندی‌شده هرگز اجرا نمی‌شوند.**
  اقدام: افزودن `trigger_cron_workflows_task` به `core/tasks.py` بر اساس منطق `server.py:70-120`.
  **صحت‌سنجی: انجام نشده.** `CELERY_BEAT_SCHEDULE` در `settings.py:175-180` هنوز فقط `check_timeouts_task` را دارد؛ `core/tasks.py` فقط `check_timeouts_task` و `advance_process_task` دارد و هیچ‌کدام `trigger_type='cron'` را ارزیابی نمی‌کنند. فیلدهای `trigger_type` و `cron_expression` در `core/models.py:114-115` همان‌جا ذخیره می‌شوند و هیچ‌کس نمی‌خواندشان. فرایندهای زمان‌بندی‌شده هرگز اجرا نمی‌شوند.

- [x] **۴.۵ — وصل کردن قابلیت‌های AI.** — ⚠️ **فقط working tree**
  **صحت‌سنجی: انجام شد.** روت‌ها ثبت شده‌اند (`core/urls.py:16,28,29`)، ویوها پیاده‌اند (`core/views.py:413` با SSE واقعی، `:540`)، و گره‌های `ai_task`/`ocr_task` دیگر pass-through نیستند — `_run_ai_node` در `engine.py:50` تعریف و در `:460` صدا زده می‌شود. تابع `inject_variables` هم همین‌جا زنده شد (`engine.py:78,79,84`). پیکربندی پرووایدر از import-time به **per-call از دیتابیس** منتقل شد: `services/ai_service.py:77-84` مقدار `AIProviderConfig.get_active()` را می‌خواند و در صورت نبود به env عقب‌نشینی می‌کند.
  **باقی‌مانده از زیرکارها:** تاریخچه گفتگو همچنان در dict سطح‌کلاس است (`emergentintegrations/llm/chat.py:81` → `LlmChat._sessions`) که تحت ۳ worker گانیکورن نشت حافظه و اختلاط نشست می‌دهد. ضمناً `frontend/src/pages/Chat.js` هیچ ارجاعی به endpointهای جدید ندارد — یعنی صفحه چت هنوز به بک‌اند جدید وصل نشده.

- [ ] **۴.۶ — جایگزینی endpointهای stub با پیاده‌سازی واقعی.**
  در `core/views.py`: `analytics_users:212` و `analytics_forms:217` مقدار خالی ثابت برمی‌گردانند؛ `comments_view:219-225` هیچ چیزی ذخیره نمی‌کند و در POST یک شیء ساختگی echo می‌کند؛ `dashboard_view:184-189` توصیه‌ها و فعالیت‌های **جعلی hardcode شده** برمی‌گرداند (مثلاً «Workflow 'Leave Request' created» توسط «System») و `running_processes` همیشه آرایه خالی است.
  توجه: کامنت‌ها در فرانت (`Inbox.js`) واقعاً استفاده می‌شوند، پس نیاز به مدل `Comment` واقعی است.
  **صحت‌سنجی: انجام نشده.** شماره‌خط‌ها جابه‌جا شده‌اند ولی هر چهار مورد پابرجاست: `analytics_users` (`views.py:617`) و `analytics_forms` (`:622`) لیست خالی برمی‌گردانند؛ `comments_view` (`:627-631`) با کامنت صریح «Mocking comments for now» شیء ساختگی echo می‌کند و مدل `Comment` در `core/models.py` وجود ندارد؛ `dashboard_view` (`:588-593`) همان توصیه و فعالیت جعلی «Workflow 'Leave Request' created / System» را تولید می‌کند.

- [ ] **۴.۷ — یکسان‌سازی سه پیاده‌سازی موازی SLA.**
  `lib/sla.js` منبع اصلی است، ولی `ProcessMonitoring.js:50-53` تابع `computeBottleneck` خودش را دارد و `ProcessTimeline.js:153` محاسبه سومی. همه باید از `getSLAStatus` استفاده کنند. ضمناً `ProcessMonitoring` فقط نقطه قرمز نشان می‌دهد در حالی که Inbox و Dashboard badge برچسب‌دار دارند.
  **صحت‌سنجی: نیمه‌انجام.** `ProcessMonitoring.js:8` حالا `getSLAStatus` را از `@/lib/sla` import و در `:92` استفاده می‌کند، ولی `computeBottleneck` محلی در `:50` باقی مانده و در `:131` مصرف می‌شود — دو مسیر محاسبه موازی در یک فایل.

- [x] **۴.۸ — پاس دادن prop `users` به Inspector.**
  **صحت‌سنجی: انجام شده — پلن این را اشتباه باز گزارش می‌کند.** `Inspector.js:14` هنوز prop `users` را در امضا می‌گیرد و در `:142` dropdown را از آن می‌سازد، و **هر دو سازنده حالا آن را پاس می‌دهند**: `WorkflowBuilder.js:308` و `SimpleWorkflowBuilder.js:295`. dropdown «کاربر مشخص» دیگر خالی نیست.

- [ ] **۴.۹ — وصل کردن Command Palette.**
  `components/CommandPalette.js` (۱۶۷ خط، کامل) و `lib/uiContext.js` (۲۳ خط) توسط **هیچ فایلی import نمی‌شوند**. هیچ listener برای `Ctrl+K` در کل پروژه وجود ندارد و `UIProvider` در درخت `App.js:95-110` نیست. حدود ۱۵ خط کار در `App.js` و افزودن دکمه جستجو در `Layout.js`. وابسته به کار ۲.۱.
  **صحت‌سنجی: انجام نشده — تأیید شد.** صفر importکننده برای `CommandPalette`، صفر برای `uiContext`/`UIProvider`/`usePalette`، و صفر تطابق برای `metaKey`/`ctrlKey` در کل `frontend/src`. ضمناً وابستگی‌اش به ۲.۱ هنوز برقرار است: `CommandPalette.js:36` به `/search` می‌زند که وجود ندارد.

- [ ] **۴.۱۰ — رفع خطای autosave بی‌صدا.**
  `hooks/useWorkflowManager.js:50` خطاها را با کامنت `/* swallow background save errors */` می‌بلعد. همراه با autosave روی `onNodeDragStop` (`WorkflowBuilder.js:98`) یعنی **از دست رفتن بی‌صدای داده**.
  **صحت‌سنجی: انجام نشده — هر دو خط دقیقاً سر جایشان.** `useWorkflowManager.js:50` همان `} catch (e) { /* swallow background save errors */ }` است و `saveSilently` از `updateNode:56` هم صدا زده می‌شود. `WorkflowBuilder.js:98-100` تابع `onNodeDragStop` را می‌سازد که در `:273` به ReactFlow وصل است.

- [ ] **۴.۱۱ — رفع نوار ناوبری موبایل.** `Layout.js:148` کلاس `grid-cols-5` دارد ولی `NAV` فقط ۳ آیتم دارد (خطوط ۸-۱۲)، پس آیتم‌ها در ۳/۵ سمت راست فشرده می‌شوند. `AdminLayout.js:176` این را درست انجام داده و می‌تواند الگو باشد.
  **صحت‌سنجی: انجام نشده — دقیقاً همان‌طور که توصیف شده.** `Layout.js:148` هنوز `grid grid-cols-5` است و `NAV` در `:8-12` سه آیتم دارد (داشبورد، کارتابل، پایش زنده).

- [ ] **۴.۱۲ — تصمیم درباره نمودارهای داشبورد.**
  `plan/tasks.md` کار ۹ خواسته بود نمودارها در `Dashboard.js` باشند. در عمل همه در `pages/Analytics.js` پیاده شده‌اند و `Dashboard.js` هیچ import از recharts ندارد. اگر این تغییر عمدی بوده، `plan/tasks.md` اصلاح شود؛ وگرنه نمودارها منتقل شوند.
  **صحت‌سنجی: تصمیم گرفته نشده — وضعیت بدون تغییر.** `Dashboard.js` صفر ارجاع به recharts دارد و `Analytics.js` چهار مورد. تصمیم همچنان با شماست؛ این آیتم تا آن موقع باز می‌ماند.

---

## فاز ۵ — حذف کد مرده و وابستگی‌های بلااستفاده

### ۵الف — فایل‌های بدون هیچ importکننده

- [ ] **۵.۱** — `frontend/src/hooks/use-toast.js` (۱۵۵ خط) + `components/ui/toaster.jsx` + `components/ui/toast.jsx`. کل استک toast شدسی‌ان مرده است؛ پروژه از `sonner` استفاده می‌کند.
  **صحت‌سنجی: تأیید شد.** هر سه وجود دارند؛ زنجیره import فقط `toast.jsx ← toaster.jsx ← (هیچ‌کس)` است و پروژه از `sonner` استفاده می‌کند (`App.js:2`، رندر در `:103`، ۱۲ فایل دیگر).
- [ ] **۵.۲** — `frontend/src/constants/testIds/` (۳ فایل، ۵۴ خط).
  **صحت‌سنجی: تأیید شد.** سه فایل هست، صفر importکننده.
- [ ] **۵.۳** — رفع تکرار `components/ui/skeleton.js` و `skeleton.jsx`.
  **صحت‌سنجی: تأیید شد.** هر دو وجود دارند؛ سه مصرف‌کننده (`Dashboard.js:7`، `Inbox.js:7`، `WorkflowsList.js:7`) به دلیل ترتیب `resolve.extensions` به `.js` برمی‌خورند و `.jsx` مرده است.
- [ ] **۵.۴** — حذف حدود ۳۲ کامپوننت بلااستفاده از `components/ui/`. از ۴۷ فایل تنها حدود ۱۴ تا import می‌شوند. موارد بلااستفاده: `accordion`، `aspect-ratio`، `avatar`، `badge`، `breadcrumb`، `calendar`، `card`، `carousel`، `collapsible`، `command`، `context-menu`، `drawer`، `dropdown-menu`، `form`، `hover-card`، `input-otp`، `menubar`، `navigation-menu`، `pagination`، `progress`، `radio-group`، `resizable`، `scroll-area`، `separator`، `slider`، `table`، `toggle`، `toggle-group`، `tooltip`.
  **صحت‌سنجی: تأیید شد با سه اصلاح عددی.** در واقع **۱۵ فایل زنده**‌اند (نه ۱۴): `alert.jsx`، `alert-dialog.jsx`، `button.jsx`، `checkbox.jsx`، `dialog.jsx`، `input.jsx`، `label.jsx`، `popover.jsx`، `select.jsx`، `sheet.jsx`، `skeleton.js`، `sonner.jsx`، `switch.jsx`، `tabs.jsx`، `textarea.jsx`. `toggle` فقط **به‌صورت غیرمستقیم** مرده است (توسط `toggle-group.jsx:5` import می‌شود). `toaster.jsx` در فهرست پلن جا افتاده و جزو همان ۳۲ است. مجموعه مرده دقیق: ۲۸ نام درست فهرست + `toggle.jsx` + `toggle-group.jsx` + `toaster.jsx` + `toast.jsx` + `skeleton.jsx`.

### ۵ب — وابستگی‌های npm

- [ ] **۵.۵ — تصمیم درباره لایه داده.** `@tanstack/react-query` و `swr` هر دو نصب‌اند و **هیچ‌کدام استفاده نمی‌شوند** — جستجوی `useQuery|useMutation|useSWR` صفر نتیجه دارد. `QueryClientProvider` در `index.js:19` mount شده ولی مصرف‌کننده‌ای ندارد. صد درصد واکشی داده دستی با `useEffect` + axios است.
  دو مسیر: یا هر دو حذف شوند، یا react-query واقعاً به‌کار گرفته شود (که polling دستی `badgeContext.js:35-51` و واکشی تکراری `/users` در ۵ جای مختلف را حل می‌کند). **حذف با دامنه انتخابی سازگارتر است.**
  **صحت‌سنجی: تأیید شد.** هر دو بسته نصب‌اند (`@tanstack/react-query` 5.56.2، `swr` 2.3.8)، صفر تطابق برای `useQuery|useMutation|useSWR` در کل `frontend/src`، و `swr` حتی یک ارجاع هم ندارد. `QueryClientProvider` در `index.js:19` با کانفیگ `:7-14` mount است و مصرف‌کننده ندارد.
- [ ] **۵.۶ — حذف `cra-template`** از `dependencies` (خط ۳۹ `package.json`). این باید بعد از ساخت پروژه حذف می‌شد.
- [ ] **۵.۷ — حذف وابستگی‌های بلااستفاده**: `dayjs`، `date-fns`، `lodash` (+ `@types/lodash`)، `zod`، `react-hook-form`، `@hookform/resolvers`، ~~`next-themes`~~، `vaul`، `embla-carousel-react`، `input-otp`، `react-day-picker`، `cmdk`. پروژه برای تاریخ از `moment-jalaali` و برای تم از `themeContext` دست‌ساز استفاده می‌کند.
  ⚠️ پس از حذف کامپوننت‌های ui در ۵.۴، بسته‌های `@radix-ui/*` متناظر هم قابل حذف‌اند.
  **صحت‌سنجی: تأیید شد با دو اصلاح.** ⚠️ **`next-themes` قابل حذف نیست** — توسط `components/ui/sonner.jsx` استفاده می‌شود که از طریق `App.js:2` زنده است؛ اول باید `sonner.jsx` اصلاح شود. تعداد `@radix-ui/*` **۲۷** است نه ۳۰، که ۹ تای آن زنده‌اند (`react-alert-dialog`، `react-checkbox`، `react-dialog`، `react-label`، `react-popover`، `react-select`، `react-slot`، `react-switch`، `react-tabs`) و ۱۸ تا مرده. از بقیه فهرست: شش مورد (`dayjs`، `date-fns`، `lodash`، `@types/lodash`، `zod`، `@hookform/resolvers`) صفر ارجاع دارند و شش مورد دیگر فقط توسط فایل‌های مرده `ui/*` استفاده می‌شوند. تأیید شد که تاریخ از `moment-jalaali` (فقط در `lib/jalali.js`) و تم از `lib/themeContext.js` می‌آید.

### ۵ج — پاک‌سازی کد

> **صحت‌سنجی کل بخش ۵ج: هیچ‌کدام انجام نشده، همه تأیید شدند.** فقط شماره‌خط‌ها کمی جابه‌جا شده‌اند که در هر آیتم اصلاح شده است.

- [ ] **۵.۸ — حذف importهای بلااستفاده.** `WorkflowBuilder.js` حدود ۲۰ نماد بلااستفاده import می‌کند (`useEffect`، `useMemo`، `useRef`، `useReactFlow`، `ReactFlowProvider`، مجموعه آیکون‌ها در خطوط ۹-۱۱، کل خانواده `Select` در خط ۱۹، `fromNow`، `OP_LABELS`، و `edgeTypes` که در خط ۵۹ تعریف و هرگز استفاده نمی‌شود). همچنین `App.js:1` (`useNavigate`)، `WorkflowsList.js:3` (`MoreHorizontal`)، `ProcessMonitoring.js:4` (`X`).
  **صحت‌سنجی: تأیید شد — و در working tree کمی بدتر شد** (یک import جدید `getNodeMeta` در `:28` اضافه شده بدون حذف هیچ‌کدام). آیکون‌های بلااستفاده: `MessageSquare:9`؛ `Zap`، `FileText`، `CheckCircle2`، `GitBranch`، `Square`، `Settings2`، `Send` در `:10`؛ `Clock`، `Split`، `Bot`، `ScanText`، `Info` در `:11`.
- [ ] **۵.۹ — فعال‌سازی lint.** `Dockerfile:20` مقدار `DISABLE_ESLINT_PLUGIN=true` را ست می‌کند و `craco.config.js:86` قانون `react-hooks/exhaustive-deps` را فقط `warn` گذاشته. **در build پروداکشن هیچ lint ای اجرا نمی‌شود** — به همین دلیل موارد ۵.۸ کشف نشده باقی مانده‌اند. پس از پاک‌سازی، lint فعال شود.
- [ ] **۵.۱۰ — یکسان‌سازی الگوهای UI**: `OrgChart.js:58` از `window.confirm` استفاده می‌کند در حالی که `UserManagement.js:379` از `AlertDialog`؛ `MobileApprovals.js:42` از `window.location.href` به‌جای router؛ `AdminLayout.js:215` یک global به نام `window.__jaryanRestartTour` می‌سازد که `Dashboard.js:69` صدایش می‌زند (به‌جای context).
- [ ] **۵.۱۱ — رفع اعداد لاتین باقی‌مانده.** `toFaNumber` عمدتاً استفاده شده ولی جا افتاده در: `WorkflowsList.js:119`، `MobileApprovals.js:49`، و `ProcessTimeline.js:21-23`.
  **صحت‌سنجی: تأیید شد — با یک اصلاح.** `WorkflowsList.js:119` کلاس `fa-nums` دارد ولی `toFaNumber` ندارد؛ `MobileApprovals.js:57` (نه ۴۹) هیچ‌کدام را ندارد؛ `ProcessTimeline.js:21-23` اعداد خام را در `fmtDuration` درج می‌کند و کل فایل `toFaNumber` را import نمی‌کند. ⚠️ **`Analytics.js:26-34` مورد خراب نیست** — `toFaNumber` را در `:11` import کرده و درست به‌کار می‌برد؛ آن پیاده‌سازی مرجع است، نه یک نشتی.
- [ ] **۵.۱۲ — رفع نشتی‌های جهت‌دهی RTL.** موارد فیزیکی به‌جای منطقی: `WorkflowBuilder.js:236` (`border-l`)، `:254` (`pr-6`)، `:287` (`bottom-4 right-4`)، `:354` (پنل شبیه‌سازی)، و `Inspector.js:53,61` / `Layout.js:23` / `AdminLayout.js:40`.
  **صحت‌سنجی: تأیید شد — با یک تله.** خطوط به‌روز: `WorkflowBuilder.js:236`، `:255`، `:288`، `:356`. `Inspector.js:53,61` و `Layout.js:23` همچنان `border-l`/`border-r` دارند. ⚠️ **`AdminLayout.js` دیگر کلاس Tailwind ندارد** — مرز را به استایل inline منتقل کرده (`:42` مقدار `borderLeft: "1px solid rgba(255,255,255,0.08)"`)، پس یک جست‌وجوی کلاس‌محور آن را پیدا نمی‌کند.
- [ ] **۵.۱۳ — حذف فونت تکراری.** Vazirmatn دو بار بارگذاری می‌شود: `public/index.html:10` و `index.css:5` (دومی به‌صورت `@import` که رندر را بلاک می‌کند).
- [ ] **۵.۱۴ — حذف کلیدهای legacy.** `lib/api.js:9-16` هنوز کلیدهای `raahkar_token` و `raahkar_user` را از نام قبلی محصول پشتیبانی می‌کند.
- [ ] **۵.۱۵ — تصمیم درباره فایل‌های بزرگ.** `FormBuilder.js` (۷۶۳ خط) و `WorkflowBuilder.js` (۴۹۲ خط) و `Inspector.js` (۵۴۷ خط) و `ProcessTimeline.js` (۴۶۹ خط) کاندیدای تفکیک‌اند. اختیاری — فقط اگر قرار است روی آن‌ها کار شود.

### ۵د — تست‌ها

- [ ] **۵.۱۶ — بازسازی یا حذف تست‌های بک‌اند.** `backend/tests/` (حدود ۴۰ تست در ۳ فایل) **اصلاً collect نمی‌شود**: `test_iter2.py:9` و `test_iter3.py:6` دستور `from engine import evaluate_rule` می‌دهند که حالا `core.models` را import می‌کند و بدون `django.setup()` خطای `AppRegistryNotReady` می‌دهد. حتی اگر collect می‌شد، همه به مسیرهای بدون اسلش FastAPI می‌زنند که با `APPEND_SLASH = False` رد می‌شوند، و `conftest.py:5-16` به مسیر مطلق `/app/frontend/.env` از محیطی دیگر متکی است.
  اقدام: افزودن `pytest-django`، بازنویسی به تست‌های DRF با `APIClient`، و حذف `docstring` قدیمی «Raahkar» در `backend_test.py:1`.
  **صحت‌سنجی: تأیید شد، کاملاً دست‌نخورده.** `test_iter2.py:9` و `test_iter3.py:6` هنوز `from engine import evaluate_rule` در سطح ماژول دارند؛ `conftest.py:9` هنوز `/app/frontend/.env` را باز می‌کند؛ `requirements.txt:15` فقط `pytest>=8.0.0` دارد و **`pytest-django` نیست**؛ هیچ `pytest.ini`/`setup.cfg`/`pyproject.toml`/`tox.ini` در ریشه یا `backend/` وجود ندارد؛ و docstring «Raahkar» در `backend_test.py:1` سر جایش است. ضمناً یک پوشه خالی `tests/` در ریشه ریپو هست که فقط `__init__.py` صفربایتی دارد.
- [ ] **۵.۱۷ — `core/tests.py`** هنوز stub خالی Django است. صفر تست برای استک زنده وجود دارد.
  **صحت‌سنجی: تأیید شد.** سه خط: یک import و کامنت `# Create your tests here.`

---

## فاز ۶ — همگام‌سازی مستندات

مستندات در حال حاضر گمراه‌کننده‌اند و باعث می‌شوند هر توسعه‌دهنده جدید مسیر اشتباه برود.

- [ ] **۶.۱ — اصلاح `docs/01-overview.md`.** ادعا می‌کند Django 6 + PostgreSQL + MongoDB، در حالی که بخش «MVP پیاده‌سازی شده ✅» شامل مواردی است که در عمل کار نمی‌کنند (AI Chat-to-Workflow، ساخت Cron Workflow، Command Palette، هشدارهای SLA). این چک‌مارک‌ها تا پیش از تکمیل فاز ۴ باید برداشته شوند.
  **صحت‌سنجی: تأیید شد — و یک ایراد اضافه.** `docs/01-overview.md:39-41` ادعای Django 6.0+ / PostgreSQL 15+ / MongoDB 7.0 دارد، در حالی که `requirements.txt:36` مقدار `django>=4.2,<5.2` را pin کرده — **ادعای نسخه جدا از مشکل چک‌مارک‌ها هم غلط است**. چک‌مارک‌های بی‌پشتوانه: AI Chat-to-Workflow (`:79`)، هشدار SLA (`:88`)، Command Palette (`:89`)، Cron خودکار (`:94`).
- [ ] **۶.۲ — اصلاح `plan/requirements.md`.**
  **صحت‌سنجی: تأیید شد.** `plan/requirements.md:7` هنوز می‌گوید پروژه روی «FastAPI + MongoDB Motor (async)» ساخته شده.
- [ ] **۶.۳ — اصلاح `plan/tasks.md`.**
  **صحت‌سنجی: تأیید شد — و پلن دو چک‌مارک غلط را جا انداخته.** وضعیت فعلی: ۱ `[x]`، ۲ `[ ]`، ۳ `[x]`، ۴ `[ ]`، ۵ `[-]`، ۶ تا ۹ `[~]`. علاوه بر کار ۲ که پلن درست تشخیص داده (endpointها موجودند، هرچند فقط در working tree): **کار ۱ با `[x]` غلط است** چون روت `analytics/dashboard` وجود ندارد ولی `Analytics.js` صدایش می‌زند، و **کار ۳ با `[x]` غلط است** چون روت `search` وجود ندارد ولی `CommandPalette.js:36` صدایش می‌زند. این دو از موردی که پلن ذکر کرده جدی‌ترند.
- [ ] **۶.۴ — بازبینی `docs/03-backend.md`، `04-api-reference.md`، `07-workflow-engine.md`، `08-ai-integration.md`، `17-background-tasks.md`** در برابر کد واقعی پس از فازهای ۲ و ۴.
  **صحت‌سنجی: مسئله جای دیگری است.** هر پنج فایل وجود دارند و **از قبل استک Django را توصیف می‌کنند** — `03-backend.md:5` مهاجرت به Django+DRF و هیبرید PostgreSQL+MongoDB را دارد، `:16-18` جایگزینی حلقه asyncio با Celery Beat را، `07-workflow-engine.md:88-108` تقسیم Mongo/ORM را، و `17-background-tasks.md:1-7` Celery+Redis را. هیچ‌کدام FastAPI یا uvicorn را نام نمی‌برند. مشکل واقعی: `04-api-reference.md` مسیرها را **بدون اسلش پایانی** مستند کرده (مثلاً `:14`، `:415`) و روت‌های ناموجود را فهرست می‌کند، و `docs/12-testing.md:5-8` ساختار `backend/tests/` را ناقص توصیف کرده.
- [ ] **۶.۵ — نوشتن `CLAUDE.md` یا `CONTRIBUTING.md`** در ریشه که استک زنده، دستور اجرای محلی و قراردادهای پروژه را مشخص کند.
  **صحت‌سنجی: تأیید شد.** هیچ‌کدام وجود ندارند. پوشه `.claude/` هست ولی خالی است و `README.md` دقیقاً یک خط است: `# Here are your Instructions`.

---

## یافته‌های جدید (صحت‌سنجی ۱۴۰۵/۰۵/۱۹)

مواردی که در تدوین اولیه پلن نبودند و در بررسی کد پیدا شدند. به ترتیب فوریت:

- [ ] **ج.۱ — کامیت کردن working tree.** *(فوری‌ترین)*
  ۲۲ فایل تغییریافته و ۱۰ فایل untracked شامل **تمام** اصلاحات امنیتی (۱.۳، ۱.۴، ۱.۵)، کل `core/permissions.py`، سه migration، و لایه AI. تا وقتی کامیت نشوند، `HEAD` همچنان endpointهای بی‌محافظ و توکن بی‌انقضا دارد. پیشنهاد: تقسیم به چند کامیت منطقی (امنیت / AI / اجرای بدون داکر) نه یک کامیت بزرگ.

- [ ] **ج.۲ — `workflowUtils.js` را وارد گیت کنید.** *(build را می‌شکند)*
  الگوی `lib/` در `.gitignore:77` این فایل را بیرون نگه داشته، در حالی که چهار فایل tracked آن را import می‌کنند. `git add -f frontend/src/lib/workflowUtils.js` و محدودکردن الگو به `/node/lib/`. زیرمجموعه ۰.۱ ولی مستقلاً بحرانی.

- [ ] **ج.۳ — گارد `NODE_TYPES_META` در حلقه‌های پالت.**
  `getNodeMeta()` با fallback اضافه شد ولی `WorkflowBuilder.js:111` و `SimpleWorkflowBuilder.js:76,137` هنوز مستقیم ایندکس می‌کنند (`NODE_TYPES_META[nodeType].label`) و روی کلید ناشناخته کرش می‌کنند. باقی‌مانده ۱.۱.

- [ ] **ج.۴ — نشت تاریخچه گفتگو بین نشست‌ها.**
  `emergentintegrations/llm/chat.py:81` تاریخچه را در `LlmChat._sessions` سطح‌کلاس نگه می‌دارد. تحت سه worker گانیکورن یعنی نشت حافظه و احتمال اختلاط محتوای نشست بین کاربران. زیرکار ۴.۵ که هنوز باز است.

- [ ] **ج.۵ — `Chat.js` به بک‌اند جدید وصل نیست.**
  endpointهای `ai/generate-workflow/` و `ai/sessions/` ساخته شدند ولی `frontend/src/pages/Chat.js` هیچ ارجاعی به آن‌ها ندارد.

- [ ] **ج.۶ — fallback خطرناک در تخصیص تسک.**
  `engine.py:172-178`: اگر کاربری با نقش موردنظر پیدا نشود، به `User.objects.afirst()` عقب‌نشینی می‌کند — یعنی **یک کاربر دلخواه**، نه خطا. روی داده‌های منابع انسانی این می‌تواند تسک محرمانه را به فرد اشتباه بدهد.

- [ ] **ج.۷ — حساب seed «طراح فرایند» نمی‌تواند طراحی کند.**
  `core/management/commands/seed.py:20-23` به `designer@jaryan.ir` نقش `کارمند` می‌دهد، ولی `DESIGNER_ROLES` در `permissions.py:26` فقط `مدیر` است.

- [ ] **ج.۸ — نبود snapshot از تمپلیت فرایند.**
  `advance_process` در `engine.py:391` هر بار workflow زنده را می‌خواند و process instance فقط `workflow_id` را نگه می‌دارد (`core/views.py:110-121`). یعنی **ویرایش یک فرایند منتشرشده، نمونه‌های در حال اجرا را تغییر می‌دهد**. در `CURRENT_STATE.md` هم ذکر شده ولی در پلن آیتم نداشت.

- [ ] **ج.۹ — پیام کامیت `c364f27` با کد نمی‌خواند.**
  عنوانش «remove trailing-slash interceptor» است ولی منطق افزودن اسلش هنوز در `frontend/src/lib/api.js:28-35` هست — هم در `HEAD` هم در working tree. (و درست هم هست، چون DRF به آن نیاز دارد و `settings.py:34` مقدار `APPEND_SLASH = False` دارد.)

---

```
فاز ۰ (پیش‌نیاز)
   ↓
فاز ۱ (باگ‌های بحرانی) ──── مستقل، می‌تواند فوراً شروع شود
   ↓
فاز ۲الف (پورت قابلیت‌ها) ──→ فاز ۲ب (حذف FastAPI)
   ↓                              ↓
فاز ۳ (نقش‌ها) ←──────────────────┘
   ↓
فاز ۴ (تکمیل قابلیت‌ها) — ۴.۹ وابسته به ۲.۱ / ۴.۱ پیش‌نیاز SLA
   ↓
فاز ۵ (پاک‌سازی) — پس از تثبیت رفتار
   ↓
فاز ۶ (مستندات) — آخر، وقتی واقعیت تثبیت شده
```

**نکته درباره ترتیب**: فاز ۵ عمداً بعد از فاز ۴ آمده. حذف کد مرده قبل از تکمیل قابلیت‌ها ریسک دارد چون بعضی «کد مرده» در واقع قطعات نیمه‌وصل قابلیت‌های ناتمام است (مثل `CommandPalette` و `uiContext` که در ۴.۹ زنده می‌شوند، نه حذف).

---

## تأیید و صحت‌سنجی

پس از هر فاز:

۱. **فاز ۱**: باز شدن `/admin/workflows/:id` بدون کرش؛ تلاش برای تأیید تسک متعلق به کاربر دیگر باید ۴۰۳ بدهد؛ توکن منقضی‌شده باید ۴۰۱ بدهد.
۲. **فاز ۲**: تمام endpointهای فرانت‌اند پاسخ می‌دهند (بررسی با Network tab یا اجرای کامل سناریوها)؛ `grep -r "server\|from db import\|from models import" backend/ --exclude-dir=.venv` باید خالی باشد.
۳. **فاز ۳**: ساخت کاربر با هر ۴ نقش؛ بررسی اینکه کارمند نمی‌تواند کاربر بسازد؛ ساخت فرایند از تمپلیت و بررسی اینکه تسک به کسی تخصیص می‌یابد.
۴. **فاز ۴**: ساخت تسک با deadline گذشته و دیدن badge «دیرکرد»؛ ثبت یک فرایند cron و انتظار برای اجرا؛ `Ctrl+K`.
۵. **فاز ۵**: `yarn build` بدون خطا؛ اجرای lint با صفر خطا؛ `yarn why <package>` برای اطمینان از حذف امن.

پیشنهاد: قبل از شروع فاز ۵، حداقل چند تست دود (smoke test) نوشته شود تا حذف‌ها بدون شبکه ایمنی انجام نشوند.

---

## پیوست الف — خارج از دامنه انتخاب‌شده

این موارد در بررسی پیدا شدند ولی در دامنه فعلی نیستند. فهرست شده‌اند تا از دست نروند:

**امنیت و حریم خصوصی**
- `frontend/public/index.html:42-112` — PostHog با **session recording فعال** و کلید hardcode شده، روی محصولی که داده‌های منابع انسانی، حقوق و قرارداد را نگه می‌دارد. `recordCrossOriginIframes: true` هم فعال است.
- `frontend/src/pages/Analytics.js:340` — توکن احراز هویت در **query string** برای خروجی CSV؛ به تاریخچه مرورگر و لاگ‌های nginx نشت می‌کند.
- `frontend/public/index.html:26` — بارگذاری اسکریپت شخص ثالث pin نشده از `assets.emergent.sh` در هر بار لود صفحه.
- `frontend/package.json:90` — `@emergentbase/visual-edits` از یک URL تاربال خارج از رجیستری نصب می‌شود و در `craco.config.js:139-152` به build وصل است.
- `backend/.env` در گیت commit شده با `DEBUG=True` و `SECRET_KEY` ۱۹ بایتی placeholder، و در docker-compose مستقیماً به‌عنوان `env_file` پروداکشن استفاده می‌شود.
- `settings.py` — `ALLOWED_HOSTS = ["*"]` و `CORS_ALLOW_ALL_ORIGINS = True`.
- `frontend/nginx.conf` — هیچ هدر امنیتی (CSP، X-Frame-Options، X-Content-Type-Options) ندارد.
- `Login.js:10-13,18-19` — اعتبارنامه‌های دمو در فرم ورود pre-fill شده‌اند.

**بهداشت ریپو**
- پوشه `node/` یک نصب کامل Node.js با حدود ۹۹ هزار فایل داخل ریپو است.
- `backend/db.sqlite3` و `backend/.venv` روی دیسک هستند (gitignore شده‌اند ولی ارزش بررسی دارند).
- `frontend/public/` فقط شامل `index.html` است — بدون favicon (که در هر بار لود ۴۰۴ می‌دهد، قابل مشاهده در `.logs/backend.log:12`)، بدون `manifest.json` و `robots.txt`.

**معماری**
- `core/middleware.py:7-15` — ContextVar مربوط به tenant فقط **بعد از** پاسخ ریست می‌شود و هرگز قبل از view مقداردهی نمی‌شود. ضمناً `TenantManager.get_queryset` وقتی ContextVar خالی باشد **همه ردیف‌ها** را برمی‌گرداند (`core/models.py:20`) — رفتار fail-open است، نه fail-closed.
- `core/mongo.py` — تابع `get_db` شرط `if db is None` را روی متغیر global بررسی می‌کند در حالی که `init_mongo` روی `if client is None` گارد می‌گذارد.
- `entrypoint.sh:12-32` بدون قید و شرط منتظر Postgres می‌ماند، پس ایمیج داکر نمی‌تواند در حالت SQLite که `settings.py:104-110` تبلیغ می‌کند اجرا شود.
- `core/models.py:27,35` — `default=uuid.uuid4` روی `CharField` (شیء UUID به‌جای رشته).
- `Form` در پنل ادمین ثبت نشده با اینکه یک مدل درجه‌یک است.
