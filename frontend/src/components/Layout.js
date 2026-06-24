import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Sparkles,
  Workflow,
  FileText,
  Inbox,
  Activity,
  Smartphone,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { toFaNumber } from "@/lib/jalali";

const NAV = [
  { to: "/", icon: LayoutDashboard, label: "داشبورد", end: true, testId: "nav-dashboard" },
  { to: "/chat", icon: Sparkles, label: "ساخت با هوش مصنوعی", testId: "nav-chat" },
  { to: "/workflows", icon: Workflow, label: "فرایندها", testId: "nav-workflows" },
  { to: "/forms", icon: FileText, label: "فرم‌ها", testId: "nav-forms" },
  { to: "/inbox", icon: Inbox, label: "کارتابل", testId: "nav-inbox" },
  { to: "/monitoring", icon: Activity, label: "پایش زنده", testId: "nav-monitoring" },
];

function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <aside
      data-testid="sidebar"
      className="hidden md:flex w-64 shrink-0 border-l border-neutral-200 bg-white flex-col h-screen sticky top-0"
    >
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand to-brand-strong text-white grid place-items-center text-sm font-bold shadow-sm">ر</div>
          <div>
            <div className="text-sm font-bold text-neutral-900 leading-tight">راهکار</div>
            <div className="text-[11px] text-neutral-400">پلتفرم اتوماسیون فرایند</div>
          </div>
        </div>
      </div>

      <nav className="px-3 flex-1 space-y-1">
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              data-testid={item.testId}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? "bg-brand text-white shadow-[0_4px_14px_rgba(79,70,229,0.25)]"
                    : "text-neutral-700 hover:bg-neutral-100"
                }`
              }
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
        <a
          href="/mobile"
          target="_blank"
          rel="noreferrer"
          data-testid="nav-mobile"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-neutral-500 hover:bg-neutral-100 transition-colors"
        >
          <Smartphone className="w-4 h-4" />
          <span>نمای موبایل</span>
        </a>
      </nav>

      <div className="border-t border-neutral-200 p-3">
        <div className="flex items-center gap-3 px-2 py-2">
          <div
            className="w-8 h-8 rounded-full grid place-items-center text-white text-xs font-medium"
            style={{ background: user?.avatar_color || "#737373" }}
          >
            {user?.full_name?.[0] || "؟"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-neutral-900 truncate">{user?.full_name}</div>
            <div className="text-[11px] text-neutral-500 truncate">{user?.role}</div>
          </div>
          <button
            data-testid="logout-btn"
            onClick={() => { logout(); navigate("/login"); }}
            className="p-2 rounded-md hover:bg-neutral-100 text-neutral-500"
            title="خروج"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function MobileTopbar() {
  const { user } = useAuth();
  return (
    <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-white sticky top-0 z-30">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand to-brand-strong text-white grid place-items-center text-xs font-bold">ر</div>
        <div className="text-sm font-bold">راهکار</div>
      </div>
      <div
        className="w-7 h-7 rounded-full grid place-items-center text-white text-[11px]"
        style={{ background: user?.avatar_color || "#737373" }}
      >
        {user?.full_name?.[0]}
      </div>
    </div>
  );
}

function MobileBottomNav() {
  return (
    <div className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-neutral-200 grid grid-cols-5">
      {NAV.slice(0, 5).map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            data-testid={`m-${item.testId}`}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-1 py-2 text-[10px] ${
                isActive ? "text-neutral-900" : "text-neutral-400"
              }`
            }
          >
            <Icon className="w-5 h-5" />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </div>
  );
}

export default function Layout() {
  return (
    <div className="flex min-h-screen bg-[#fafafa]">
      <Sidebar />
      <main className="flex-1 min-w-0 flex flex-col">
        <MobileTopbar />
        <div className="flex-1 min-w-0 pb-16 md:pb-0">
          <Outlet />
        </div>
        <MobileBottomNav />
      </main>
    </div>
  );
}
