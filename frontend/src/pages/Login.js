import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth, isAdmin } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Workflow, KeyRound } from "lucide-react";

const DEMOS = [
  { email: "admin@raahkar.ir", password: "admin1234", role: "ادمین سازمان" },
  { email: "designer@raahkar.ir", password: "1234", role: "طراح فرایند" },
  { email: "manager@raahkar.ir", password: "1234", role: "مدیر تیم" },
  { email: "employee@raahkar.ir", password: "1234", role: "کارمند" },
];

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("admin@raahkar.ir");
  const [password, setPassword] = useState("admin1234");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e?.preventDefault();
    setLoading(true);
    try {
      const loggedInUser = await login(email, password);
      toast.success("خوش آمدید");
      nav(isAdmin(loggedInUser) ? "/admin" : "/");
    } catch (err) {
      toast.error("ایمیل یا رمز عبور نادرست است");
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (d) => { setEmail(d.email); setPassword(d.password); };

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-white">
      {/* Right (RTL leading) panel - hero */}
      <div className="hidden md:flex flex-col justify-between bg-neutral-50 border-l border-neutral-200 p-12 relative overflow-hidden">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-neutral-900 text-white grid place-items-center font-bold">ر</div>
          <div>
            <div className="font-semibold">راهکار</div>
            <div className="text-xs text-neutral-500">پلتفرم اتوماسیون فرایند</div>
          </div>
        </div>

        <div className="relative">
          <div className="absolute -top-10 -left-10 w-72 h-72 rounded-full bg-brand/10" />
          <div className="absolute top-32 left-24 w-40 h-40 rounded-full bg-brand/15" />
          <div className="relative">
            <Workflow className="w-12 h-12 text-brand mb-6" />
            <h1 className="text-3xl font-bold text-neutral-900 leading-snug max-w-md">
              فرایندهای سازمانی شما؛
              <br />با هوش مصنوعی، در چند ثانیه.
            </h1>
            <p className="mt-4 text-neutral-500 max-w-md leading-7 text-sm">
              راهکار، ترکیب مدرنی از Notion، Linear و n8n برای سازمان‌های ایرانی است؛
              با تقویم شمسی، رابط راست‌چین فارسی و طراحی بصری فرایند.
            </p>
          </div>
        </div>

        <div className="text-xs text-neutral-400 mono">Raahkar • Workflow OS</div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-sm">
          <div className="md:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-md bg-neutral-900 text-white grid place-items-center font-bold">ر</div>
            <div className="font-semibold">راهکار</div>
          </div>

          <h2 className="text-2xl font-semibold text-neutral-900">ورود به حساب</h2>
          <p className="text-sm text-neutral-500 mt-1">با حساب سازمانی خود وارد شوید.</p>

          <form className="mt-8 space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="email">ایمیل</Label>
              <Input
                id="email"
                data-testid="login-email"
                dir="ltr"
                className="text-left"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">رمز عبور</Label>
              <Input
                id="password"
                data-testid="login-password"
                type="password"
                dir="ltr"
                className="text-left"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button
              type="submit"
              data-testid="login-submit"
              disabled={loading}
              className="w-full bg-brand hover:bg-brand-strong text-white font-semibold shadow-[0_4px_14px_rgba(79,70,229,0.25)] transition-all"
            >
              {loading ? "در حال ورود…" : (
                <span className="inline-flex items-center gap-2">
                  ورود
                  <ArrowLeft className="w-4 h-4" />
                </span>
              )}
            </Button>
          </form>

          <div className="mt-8">
            <div className="flex items-center gap-2 text-xs text-neutral-400 mb-3">
              <KeyRound className="w-3.5 h-3.5" />
              ورود سریع با حساب‌های نمونه
            </div>
            <div className="grid grid-cols-2 gap-2">
              {DEMOS.map((d) => (
                <button
                  key={d.email}
                  type="button"
                  data-testid={`demo-${d.email.split("@")[0]}`}
                  onClick={() => fillDemo(d)}
                  className="text-right px-3 py-2 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors"
                >
                  <div className="text-xs font-medium text-neutral-900">{d.role}</div>
                  <div className="text-[10px] text-neutral-500 mono">{d.email}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
