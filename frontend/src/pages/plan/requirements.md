# Requirements Document

## Introduction

این سند نیازمندی‌های شش فیچر جدید پلتفرم «راهکار» را تعریف می‌کند. راهکار یک پلتفرم اتوماسیون فرایند سازمانی فارسی‌اول (B2B) است که سازمان‌های ایرانی را هدف قرار می‌دهد. این بهبودها هدف فروش‌پذیری محصول را دنبال می‌کنند و شامل: داشبورد Analytics پیشرفته، مدیریت کاربران سازمان، نوتیفیکیشن badge کارتابل، کتابخانه تمپلیت‌های آماده، هشدارهای بصری SLA، و جستجوی سراسری (Command Palette) می‌شوند.

پروژه روی React (CRA + Craco) با Tailwind CSS و FastAPI + MongoDB Motor (async) ساخته شده است. تمام رابط کاربری فارسی و RTL است.

---

## Glossary

- **Dashboard**: صفحه اصلی راهکار که خلاصه وضعیت فرایندهای سازمان را نمایش می‌دهد.
- **Analytics_Service**: سرویس backend که داده‌های آماری داشبورد را فراهم می‌کند.
- **User_Management_Page**: صفحه `/users` که فقط برای ادمین سازمان در دسترس است.
- **Admin**: کاربری با نقش «ادمین سازمان» که دسترسی کامل مدیریتی دارد.
- **Badge_Service**: سرویس frontend که تعداد تسک‌های pending کاربر را واکشی و نمایش می‌دهد.
- **Sidebar**: نوار ناوبری عمودی سمت راست صفحه برای دسکتاپ.
- **Bottom_Nav**: نوار ناوبری پایین صفحه برای موبایل.
- **Template_Library**: کامپوننت modal/drawer که تمپلیت‌های آماده فرایند را نمایش می‌دهد.
- **Workflow_Builder**: صفحه ویرایش بصری فرایند (`/workflows/:id`).
- **SLA_Indicator**: نشانگر بصری که وضعیت مهلت زمانی تسک را نمایش می‌دهد.
- **Inbox**: صفحه کارتابل تسک‌ها (`/inbox`).
- **Command_Palette**: پنجره جستجوی سراسری که با Ctrl+K یا کلیک روی آیکون جستجو باز می‌شود.
- **Search_Service**: endpoint جدید backend که جستجوی همزمان در تسک‌ها، فرایندها و فرم‌ها انجام می‌دهد.
- **Process_Instance**: یک نمونه اجرایی از یک فرایند که در collection `process_instances` ذخیره می‌شود.
- **Org_Id**: شناسه یکتای سازمان که ایزولاسیون داده بین سازمان‌ها را تضمین می‌کند.

---

## Requirements

---

### Requirement 1: داشبورد Analytics پیشرفته

**User Story:** به عنوان یک مدیر سازمان، می‌خواهم نمودارها و آمار تحلیلی روی داشبورد ببینم تا بتوانم بدون باز کردن صفحات مجزا، وضعیت کلی فرایندهای سازمانم را رصد کنم.

#### Acceptance Criteria (`/`) ناوبری می‌کند، THE Analytics_Service SHALL داده‌های ۳۰ روز گذشته را با فیلتر `org_id` واکشی کرده و تعداد فرایندهای راه‌اندازی‌شده به تفکیک روز شمسی را برگرداند.

2. THE Dashboard SHALL یک نمودار خطی (line chart) با recharts نمایش دهد که محور X آن تاریخ شمسی (مثلاً «۳ خرداد») و محور Y آن تعداد فرایند باشد و هر ۳۰ روز را پوشش دهد.

3. WHEN داده‌ای برای یک روز وجود نداشته باشد، THE Dashboard SHALL آن روز را با مقدار صفر در نمودار نمایش دهد (بدون gap در خط).

4. THE Analytics_Service SHALL تعداد تسک‌های سازمان را به تفکیک هر پنج وضعیت `pending`، `in_progress`، `approved`، `rejected`، و `done` محاسبه و برگرداند.

5. THE Dashboard SHALL یک نمودار دایره‌ای (pie chart) با recharts نمایش دهد که هر بخش آن برچسب فارسی وضعیت و درصد محاسبه‌شده از مجموع کل را داشته باشد.

6. THE Analytics_Service SHALL حداکثر ۵ کاربر سازمان را که بیشترین تعداد تسک با وضعیت `pending` یا `in_progress` دارند به ترتیب نزولی برگرداند؛ اگر کمتر از ۵ نفر باشند همه را برگرداند.

7. THE Dashboard SHALL یک کارت/جدول نمایش دهد که هر سطر آن نام کامل، نقش، و تعداد تسک فعال کاربر را نشان می‌دهد.

8. THE Analytics_Service SHALL میانگین دقیقه‌ای تکمیل فرایند را بر اساس فرایندهایی محاسبه کند که در ۳۰ روز گذشته به وضعیت `completed` رسیده‌اند و فاصله زمانی `created_at` تا `updated_at` (در لحظه complete شدن) را به دقیقه برگرداند.

9. THE Dashboard SHALL میانگین زمان را به صورت: کمتر از ۶۰ دقیقه → «X دقیقه»، بین ۶۰ تا ۱۴۳۹ دقیقه → «X ساعت و Y دقیقه»، ۱۴۴۰ دقیقه یا بیشتر → «X روز و Y ساعت» نمایش دهد.

10. IF هیچ فرایند تکمیل‌شده‌ای در ۳۰ روز گذشته وجود نداشته باشد، THEN THE Dashboard SHALL به جای میانگین پیام «داده کافی ندارد» را نمایش دهد.

11. WHEN واکشی داده analytics با خطا مواجه شود، THE Dashboard SHALL بخش analytics را با پیام خطای فارسی جایگزین کند اما بخش‌های دیگر داشبورد (counters، تسک‌های من) همچنان نمایش داده شوند.

12. THE Analytics_Service SHALL endpoint `GET /api/analytics/dashboard` را ارائه دهد که فقط برای کاربران دارای JWT معتبر پاسخ دهد و تمام داده‌های analytics را در یک پاسخ واحد برگرداند.

13. WHEN کاربر در یک session در صفحه داشبورد حضور دارد، THE Dashboard SHALL داده‌های analytics را فقط یک‌بار هنگام mount واکشی کند و تا reload صفحه درخواست جدیدی نفرستد.

---

### Requirement 2: مدیریت کاربران سازمان

**User Story:** به عنوان یک Admin سازمان، می‌خواهم کاربران سازمانم را مدیریت کنم تا بتوانم اعضای جدید اضافه کنم، نقش‌ها را ویرایش کنم، و کاربران غیرفعال را حذف کنم.

#### معیارهای پذیرش

1. THE User_Management_Page SHALL صفحه‌ای در مسیر `/users` ارائه دهد که تمام کاربران سازمان جاری را با نام کامل، ایمیل، نقش، و رنگ آواتار نمایش دهد.

2. WHEN کاربری با نقشی غیر از «ادمین سازمان» به مسیر `/users` ناوبری کند، THE User_Management_Page SHALL کاربر را فوراً به داشبورد (`/`) redirect کند.

3. WHEN کاربر Admin روی دکمه «افزودن کاربر» کلیک کند، THE User_Management_Page SHALL یک modal باز کند که حاوی فیلدهای: نام کامل (الزامی، ۱ تا ۱۰۰ کاراکتر)، ایمیل (الزامی، فرمت RFC 5321)، نقش (الزامی، یکی از: «ادمین سازمان»، «طراح فرایند»، «مدیر تیم»، «کارمند»)، رمز عبور اولیه (الزامی، ۶ تا ۱۲۸ کاراکتر) باشد.

4. WHEN Admin فرم افزودن کاربر را با اطلاعات معتبر ارسال کند، THE User_Management_Page SHALL کاربر جدید را با `org_id` سازمان جاری ایجاد کند و لیست کاربران را بدون reload صفحه به‌روز کند.

5. IF ایمیل وارد شده قبلاً در سیستم ثبت شده باشد، THEN THE User_Management_Page SHALL پیام «این ایمیل قبلاً ثبت شده است» را نمایش دهد و modal را باز نگه دارد.

6. WHEN Admin روی دکمه ویرایش نقش در کنار یک کاربر کلیک کند، THE User_Management_Page SHALL یک dropdown با چهار گزینه نقش نمایش دهد و با تأیید، نقش جدید را در پایگاه‌داده ذخیره کند.

7. IF عملیات PATCH نقش با خطا مواجه شود، THEN THE User_Management_Page SHALL پیام خطای فارسی نمایش دهد و نقش کاربر را به مقدار قبلی در UI برگرداند.

8. WHEN Admin روی دکمه حذف کاربر کلیک کند، THE User_Management_Page SHALL یک dialog تأیید با پیام «آیا از حذف [نام کاربر] اطمینان دارید؟» نمایش دهد.

9. WHEN Admin حذف را در dialog تأیید کند، THE User_Management_Page SHALL کاربر را از پایگاه‌داده حذف کند و از لیست بدون reload حذف کند.

10. IF عملیات DELETE با خطا مواجه شود، THEN THE User_Management_Page SHALL پیام خطای فارسی نمایش دهد و کاربر را در لیست نگه دارد.

11. IF Admin تلاش کند حساب خودش را حذف کند، THEN THE User_Management_Page SHALL پیام «امکان حذف حساب خودتان وجود ندارد» را نمایش دهد و dialog را نبندد.

12. IF Admin تلاش کند نقش خودش را به غیر از «ادمین سازمان» تغییر دهد، THEN THE User_Management_Page SHALL پیام «نمی‌توانید نقش خودتان را تغییر دهید» را نمایش دهد.

13. THE Backend SHALL endpoint `POST /api/users` را پیاده‌سازی کند که فقط برای نقش «ادمین سازمان» مجاز باشد و کاربر جدید را با `org_id` از JWT ایجاد کند.

14. THE Backend SHALL endpoint `PATCH /api/users/{id}` را پیاده‌سازی کند که فقط فیلد `role` را به‌روز کند و اگر `id` متعلق به `org_id` دیگری باشد با `404` پاسخ دهد.

15. THE Backend SHALL endpoint `DELETE /api/users/{id}` را پیاده‌سازی کند و اگر کاربر تلاش کند خودش را حذف کند با `400` و پیام `"cannot_delete_self"` پاسخ دهد.

16. IF درخواست به endpoints مدیریت کاربر توسط نقش غیر از «ادمین سازمان» ارسال شود، THEN THE Backend SHALL با `403` و پیام `"insufficient_permissions"` پاسخ دهد.

17. WHEN عملیات افزودن، ویرایش، یا حذف با موفقیت انجام شود، THE User_Management_Page SHALL یک toast notification فارسی متناسب با عملیات نمایش دهد.

---

### Requirement 3: نوتیفیکیشن Badge کارتابل

**User Story:** به عنوان یک کارمند، می‌خواهم تعداد تسک‌های در انتظارم را روی منو ببینم تا بدون ورود به کارتابل از وجود تسک‌های جدید مطلع شوم.

#### معیارهای پذیرش

1. WHEN کاربر وارد سیستم شود، THE Badge_Service SHALL تعداد تسک‌های با وضعیت `pending` که به کاربر جاری اختصاص دارند را واکشی کند.

2. THE Sidebar SHALL یک badge عددی با اعداد فارسی روی آیتم ناوبری «کارتابل» نمایش دهد.

3. WHEN تعداد تسک‌های pending صفر باشد، THE Sidebar SHALL badge را کاملاً مخفی کند (نه badge خالی).

4. WHEN تعداد تسک‌های pending بیش از ۹۹ باشد، THE Sidebar SHALL «+۹۹» را در badge نمایش دهد.

5. WHILE کاربر در tab فعال مرورگر است و احراز هویت‌شده باشد، THE Badge_Service SHALL هر ۳۰ ثانیه یک‌بار تعداد را از سرور واکشی کند.

6. IF tab مرورگر به حالت hidden برود، THEN THE Badge_Service SHALL polling را متوقف کند و پس از بازگشت tab به حالت visible دوباره شروع کند.

7. WHEN کاربر به صفحه کارتابل ناوبری کند و سپس برگردد، THE Badge_Service SHALL مقدار badge را ظرف ۱ ثانیه به‌روز کند.

8. THE Bottom_Nav SHALL برای کاربران موبایل، badge عددی مشابه را روی آیتم «کارتابل» نمایش دهد؛ و WHEN تعداد صفر باشد badge را مخفی کند.

9. IF درخواست واکشی badge با خطا مواجه شود، THEN THE Badge_Service SHALL مقدار قبلی badge را حفظ کند، بدون نمایش خطا، و تا ۳ بار با فاصله ۱۰ ثانیه دوباره تلاش کند.

10. WHEN کاربر logout کند، THE Badge_Service SHALL polling را متوقف کند و badge را پاک کند.

---

### Requirement 4: کتابخانه تمپلیت‌های آماده

**User Story:** به عنوان یک طراح فرایند، می‌خواهم از تمپلیت‌های آماده فرایندهای رایج ایرانی استفاده کنم تا بتوانم بدون طراحی از صفر، فرایندهای استاندارد را سریع‌تر راه‌اندازی کنم.

#### معیارهای پذیرش

1. THE WorkflowsList SHALL یک دکمه «از تمپلیت شروع کن» در کنار دکمه «فرایند جدید» نمایش دهد.

2. WHEN کاربر روی «از تمپلیت شروع کن» کلیک کند، THE Template_Library SHALL به‌صورت یک modal در مرکز صفحه باز شود.

3. THE Template_Library SHALL حداقل ۸ تمپلیت آماده فارسی نمایش دهد که شامل: مرخصی، تنخواه، خرید، آنبوردینگ، درخواست IT، مأموریت، بازخورد عملکرد، و قرارداد باشد.

4. THE Template_Library SHALL هر تمپلیت را با آیکون lucide-react، نام فارسی، توضیح کوتاه فارسی (حداکثر ۷۰ کاراکتر)، و تعداد گره‌ها نمایش دهد.

5. WHEN کاربر روی یک تمپلیت کلیک کند، THE Template_Library SHALL یک ناحیه پیش‌نمایش نمایش دهد که فهرست متنی تمام nodes (نوع + برچسب) و تعداد edges را نشان می‌دهد.

6. WHEN کاربر دکمه «استفاده از این تمپلیت» را کلیک کند، THE Template_Library SHALL درخواست `POST /api/workflows` با nodes و edges تمپلیت ارسال کند.

7. WHEN درخواست `POST /api/workflows` با موفقیت پاسخ دهد، THE Template_Library SHALL modal را ببندد و کاربر را به `/workflows/{new_id}` ناوبری کند.

8. IF درخواست `POST /api/workflows` با خطا مواجه شود، THEN THE Template_Library SHALL پیام خطای فارسی «خطا در ایجاد فرایند. دوباره تلاش کنید.» را نمایش دهد و modal را باز نگه دارد.

9. THE Template_Library SHALL یک input جستجو داشته باشد که نام و توضیح تمپلیت‌ها را به صورت case-insensitive و substring جستجو کند.

10. WHEN query با هیچ تمپلیتی مطابقت نداشته باشد، THE Template_Library SHALL پیام «تمپلیتی یافت نشد» را نمایش دهد.

11. WHEN Template_Library باز باشد، THE Template_Library SHALL با فشردن Escape یا کلیک خارج از modal بسته شود.

12. THE Template_Library SHALL داده‌های تمپلیت‌ها را به‌صورت hardcoded در فایل `src/lib/templates.js` نگه دارد و هیچ endpoint جدید backend نیاز نداشته باشد.

---

### Requirement 5: هشدارهای بصری SLA و مهلت

**User Story:** به عنوان یک کارمند، می‌خواهم تسک‌هایی که مهلتشان گذشته یا نزدیک است را به‌صورت بصری در کارتابل تشخیص دهم تا بتوانم اولویت‌بندی کارهایم را بهتر مدیریت کنم.

#### معیارهای پذیرش

1. THE Inbox SHALL برای هر تسک، وضعیت SLA را در لحظه render با مقایسه `deadline` (ISO string) و زمان جاری کلاینت محاسبه کند بدون درخواست اضافه به backend.

2. WHEN `deadline` تسک از زمان جاری کمتر باشد و وضعیت تسک `pending` یا `in_progress` باشد، THE Inbox SHALL یک badge «دیرکرد» با کلاس‌های `bg-red-50 text-red-700 border-red-200` نمایش دهد.

3. WHEN `deadline` تسک بیشتر از زمان جاری باشد اما فاصله آن کمتر از ۸۶۴۰۰ ثانیه (۲۴ ساعت) باشد و وضعیت تسک `pending` یا `in_progress` باشد، THE Inbox SHALL یک badge «فوری» با کلاس‌های `bg-amber-50 text-amber-700 border-amber-200` نمایش دهد.

4. WHEN یک تسک هر دو شرط بند ۲ و ۳ را به طور همزمان در یک رندر داشته باشد (که منطقاً ممکن نیست ولی به عنوان edge case)، THE Inbox SHALL فقط badge «دیرکرد» را نمایش دهد.

5. WHEN تسکی `deadline` نداشته باشد یا وضعیت آن `done`، `approved`، یا `rejected` باشد، THE Inbox SHALL هیچ badge SLA نمایش ندهد.

6. THE Dashboard SHALL در بخش «تسک‌های من» همان منطق و رنگ‌بندی badge‌های SLA را اعمال کند.

7. THE ProcessMonitoring SHALL در لیست فرایندها، برای هر فرایندی که حداقل یک تسک با وضعیت دیرکرد (شرط بند ۲) داشته باشد، یک نقطه قرمز `w-2 h-2 rounded-full bg-red-500` در کنار نام فرایند نمایش دهد.

---

### Requirement 6: جستجوی سراسری (Command Palette)

**User Story:** به عنوان یک کاربر راهکار، می‌خواهم بتوانم با یک shortcut کیبورد یا کلیک روی آیکون جستجو، به سرعت در تمام محتویات سازمانم (تسک‌ها، فرایندها، فرم‌ها) جستجو کنم تا بدون ناوبری دستی به صفحه مورد نظر برسم.

#### معیارهای پذیرش

1. THE Sidebar SHALL یک آیکون Search نمایش دهد که با کلیک روی آن Command_Palette باز شود.

2. WHEN کاربر Ctrl+K (ویندوز/لینوکس) یا ⌘+K (مک) را در هر صفحه‌ای فشار دهد، THE Command_Palette SHALL به‌صورت modal overlay در مرکز صفحه باز شود و focus روی input باشد.

3. WHEN Command_Palette باز باشد، THE Command_Palette SHALL با فشردن Escape یا کلیک روی overlay بسته شود.

4. WHEN کاربر متنی در input وارد کند و ۳۰۰ میلی‌ثانیه بدون تایپ بگذرد (debounce)، THE Command_Palette SHALL جستجو را آغاز کند.

5. WHEN query کمتر از ۲ کاراکتر باشد، THE Command_Palette SHALL هیچ درخواستی نفرستد و بخش نتایج را خالی نشان دهد.

6. THE Search_Service SHALL endpoint `GET /api/search?q={query}` را پیاده‌سازی کند که در تسک‌ها (title و workflow_name)، فرایند instances (workflow_name)، و فرم‌ها (name) به صورت case-insensitive و substring جستجو کند.

7. THE Search_Service SHALL فقط از `org_id` کاربر احراز هویت‌شده (از JWT) جستجو کند و JWT الزامی باشد.

8. THE Search_Service SHALL حداکثر ۵ نتیجه از هر دسته (تسک، فرایند، فرم) برگرداند (مجموعاً حداکثر ۱۵ نتیجه).

9. THE Command_Palette SHALL هر نتیجه را با آیکون lucide-react متناسب با نوع (Inbox برای تسک، Workflow برای فرایند، FileText برای فرم)، عنوان اصلی، و یک توضیح ثانویه نمایش دهد.

10. WHEN کاربر روی یک نتیجه کلیک کند، THE Command_Palette SHALL بسته شود و کاربر را ناوبری کند: تسک‌ها به `/inbox`، فرایندها به `/monitoring`، فرم‌ها به `/forms/{id}`.

11. WHEN هیچ نتیجه‌ای برای یک query (حداقل ۲ کاراکتر) یافت نشود، THE Command_Palette SHALL پیام «نتیجه‌ای یافت نشد» را نمایش دهد.

12. WHEN درخواست جستجو در حال انجام است، THE Command_Palette SHALL یک spinner loading نمایش دهد.

13. IF درخواست جستجو با خطا مواجه شود، THEN THE Command_Palette SHALL پیام «خطا در جستجو. دوباره تلاش کنید.» را نمایش دهد.
