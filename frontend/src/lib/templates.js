// Hardcoded Persian workflow templates.
// Each template: { id, name, description (<=70 chars), icon (lucide name string), nodes[], edges[] }
// node types allowed: trigger, task, approval, condition, form, end
// assignee_role allowed: "ادمین سازمان", "طراح فرایند", "مدیر تیم", "کارمند"
//
// Positions are laid out linearly with ~260px horizontal spacing for a clean default canvas.

let x = (i) => 80 + i * 260;

// Helper to build a linear node chain from a compact spec.
function chain(steps) {
  // steps: array of {type, label, role?, form?}
  const nodes = [];
  const edges = [];
  steps.forEach((s, i) => {
    const id = `n${i + 1}`;
    const data = {};
    if (s.role) data.assignee_role = s.role;
    if (s.form !== undefined) data.form_id = s.form;
    nodes.push({ id, type: s.type, label: s.label, position: { x: x(i), y: 160 }, data });
    if (i > 0) edges.push({ id: `e${i}`, source: `n${i}`, target: id });
  });
  return { nodes, edges };
}

export const TEMPLATES = [
  {
    id: "leave",
    name: "درخواست مرخصی",
    description: "فرایند ثبت و تایید درخواست مرخصی توسط مدیر تیم.",
    icon: "Calendar",
    ...chain([
      { type: "trigger", label: "شروع درخواست" },
      { type: "form", label: "تکمیل فرم مرخصی", role: "کارمند", form: null },
      { type: "approval", label: "تایید مدیر تیم", role: "مدیر تیم" },
      { type: "end", label: "پایان" },
    ]),
  },
  {
    id: "banknote",
    name: "درخواست تنخواه",
    description: "تنخواه با تایید مدیر و پرداخت نهایی توسط ادمین سازمان.",
    icon: "Banknote",
    ...chain([
      { type: "trigger", label: "شروع درخواست" },
      { type: "form", label: "فرم درخواست وجه", role: "کارمند", form: null },
      { type: "approval", label: "تایید مدیر تیم", role: "مدیر تیم" },
      { type: "approval", label: "تایید ادمین سازمان", role: "ادمین سازمان" },
      { type: "task", label: "پرداخت تنخواه", role: "ادمین سازمان" },
      { type: "end", label: "پایان" },
    ]),
  },
  {
    id: "purchase",
    name: "درخواست خرید",
    description: "درخواست خرید کالا با دو مرحله تایید و ثبت سفارش.",
    icon: "ShoppingCart",
    ...chain([
      { type: "trigger", label: "شروع درخواست خرید" },
      { type: "form", label: "فرم درخواست خرید", role: "کارمند", form: null },
      { type: "approval", label: "تایید مدیر تیم", role: "مدیر تیم" },
      { type: "approval", label: "تایید ادمین سازمان", role: "ادمین سازمان" },
      { type: "task", label: "ثبت سفارش خرید", role: "ادمین سازمان" },
      { type: "end", label: "پایان" },
    ]),
  },
  {
    id: "onboarding",
    name: "آنبوردینگ کارمند",
    description: "فرایند استقرار کارمند جدید و هماهنگی وظایف تیم‌ها.",
    icon: "UserPlus",
    ...chain([
      { type: "trigger", label: "شروع آنبوردینگ" },
      { type: "task", label: "ایجاد حساب کاربری", role: "ادمین سازمان" },
      { type: "task", label: "تکمیل اطلاعات کارمند", role: "کارمند" },
      { type: "task", label: "معرفی به تیم", role: "مدیر تیم" },
      { type: "end", label: "پایان" },
    ]),
  },
  {
    id: "it-request",
    name: "درخواست IT",
    description: "ثبت درخواست پشتیبانی فنی با تایید و اقدام ادمین.",
    icon: "Monitor",
    ...chain([
      { type: "trigger", label: "شروع درخواست IT" },
      { type: "form", label: "فرم درخواست فنی", role: "کارمند", form: null },
      { type: "approval", label: "تایید مدیر تیم", role: "مدیر تیم" },
      { type: "task", label: "اقدام و رفع مشکل", role: "ادمین سازمان" },
      { type: "end", label: "پایان" },
    ]),
  },
  {
    id: "mission",
    name: "درخواست مأموریت",
    description: "ثبت و تایید درخواست مأموریت کاری توسط مدیر تیم.",
    icon: "Plane",
    ...chain([
      { type: "trigger", label: "شروع درخواست مأموریت" },
      { type: "form", label: "فرم مأموریت", role: "کارمند", form: null },
      { type: "approval", label: "تایید مدیر تیم", role: "مدیر تیم" },
      { type: "end", label: "پایان" },
    ]),
  },
  {
    id: "performance",
    name: "بازخورد عملکرد",
    description: "جمع‌آوری بازخورد عملکردی کارمند و تایید مدیر.",
    icon: "Star",
    ...chain([
      { type: "trigger", label: "شروع ارزیابی عملکرد" },
      { type: "form", label: "فرم خودارزیابی", role: "کارمند", form: null },
      { type: "task", label: "بررسی بازخورد", role: "مدیر تیم" },
      { type: "approval", label: "تایید نهایی مدیر", role: "مدیر تیم" },
      { type: "end", label: "پایان" },
    ]),
  },
  {
    id: "contract",
    name: "تدوین قرارداد",
    description: "قرارداد با تایید مدیر و بررسی نهایی ادمین سازمان.",
    icon: "FileSignature",
    ...chain([
      { type: "trigger", label: "شروع درخواست قرارداد" },
      { type: "form", label: "فرم مشخصات قرارداد", role: "کارمند", form: null },
      { type: "approval", label: "تایید مدیر تیم", role: "مدیر تیم" },
      { type: "approval", label: "تایید ادمین سازمان", role: "ادمین سازمان" },
      { type: "task", label: "تنظیم و بایگانی قرارداد", role: "ادمین سازمان" },
      { type: "end", label: "پایان" },
    ]),
  },
];
