import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Sparkles,
  Workflow,
  FileText,
  Activity,
  LogOut,
  Users,
  Shield,
  BarChart2,
  Moon,
  Sun,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/themeContext";
import { useOnboarding } from "@/hooks/useOnboarding";
import ProductTour from "@/components/onboarding/ProductTour";

const ADMIN_NAV = [
  { to: "/admin", icon: LayoutDashboard, label: "داشبورد", end: true, testId: "admin-nav-dashboard", tourId: null },
  { to: "/admin/chat", icon: Sparkles, label: "ساخت با هوش مصنوعی", testId: "admin-nav-chat", tourId: "tour-nav-chat" },
  { to: "/admin/workflows", icon: Workflow, label: "فرایندها", testId: "admin-nav-workflows", tourId: "tour-nav-workflows" },
  { to: "/admin/forms", icon: FileText, label: "فرم‌ها", testId: "admin-nav-forms", tourId: null },
  { to: "/admin/monitoring", icon: Activity, label: "پایش زنده", testId: "admin-nav-monitoring", tourId: null },
  { to: "/admin/users", icon: Users, label: "مدیریت کاربران", testId: "admin-nav-users", tourId: "tour-nav-inbox" },
  { to: "/admin/org-chart", icon: Users, label: "ساختار سازمانی", testId: "admin-nav-org-chart", tourId: null },
  { to: "/admin/analytics", icon: BarChart2, label: "گزارش‌ها", testId: "admin-nav-analytics", tourId: null },
];

function AdminSidebar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  return (
    <aside
      data-testid="admin-sidebar"
      className="hidden md:flex w-64 shrink-0 flex-col h-screen sticky top-0"
      style={{
        background: "linear-gradient(180deg, #1e1b4b 0%, #312e81 100%)",
        borderLeft: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {/* Brand */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg grid place-items-center text-indigo-900 text-sm font-bold shadow-sm"
            style={{ background: "linear-gradient(135deg, #a5b4fc 0%, #818cf8 100%)" }}
          >
            ج
          </div>
          <div>
            <div className="text-sm font-bold text-white leading-tight">جریان</div>
            <div className="text-[11px] text-indigo-300">پنل مدیریت</div>
          </div>
        </div>

        {/* Admin badge */}
        <div className="mt-4 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-card/10">
          <Shield className="w-3.5 h-3.5 text-indigo-300" />
          <span className="text-[11px] font-medium text-indigo-200">دسترسی مدیریتی</span>
        </div>
      </div>

      {/* Nav links */}
      <nav className="px-3 flex-1 space-y-0.5">
        {ADMIN_NAV.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              data-testid={item.testId}
              data-tour-id={item.tourId || undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? "bg-card/15 text-white shadow-sm"
                    : "text-indigo-200 hover:bg-card/10 hover:text-white"
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Divider */}
      <div className="mx-4 h-px bg-card/10" />

      {/* User info + logout */}
      <div className="p-3">
        <div className="flex items-center gap-3 px-2 py-2">
          <div
            className="w-8 h-8 rounded-full grid place-items-center text-white text-xs font-medium shrink-0"
            style={{ background: user?.avatar_color || "#6366f1" }}
          >
            {user?.full_name?.[0] || "؟"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white truncate">{user?.full_name}</div>
            <div className="text-[11px] text-indigo-300 truncate">{user?.role}</div>
          </div>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-md text-indigo-300 hover:text-white hover:bg-card/10 transition-colors"
            title="تغییر پوسته"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            data-testid="admin-logout-btn"
            onClick={() => { logout(); navigate("/login"); }}
            className="p-2 rounded-md text-indigo-300 hover:text-white hover:bg-card/10 transition-colors"
            title="خروج"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function AdminMobileTopbar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  return (
    <div
      className="md:hidden flex items-center justify-between px-4 py-3 sticky top-0 z-30"
      style={{ background: "#1e1b4b", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-7 h-7 rounded-lg grid place-items-center text-indigo-900 text-xs font-bold"
          style={{ background: "linear-gradient(135deg, #a5b4fc 0%, #818cf8 100%)" }}
        >
          ج
        </div>
        <div>
          <div className="text-sm font-bold text-white leading-tight">جریان</div>
          <div className="text-[10px] text-indigo-300">پنل مدیریت</div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={toggleTheme}
          className="p-2 rounded-md text-indigo-300 hover:text-white transition-colors"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        <button
          onClick={() => { logout(); navigate("/login"); }}
          className="p-2 rounded-md text-indigo-300 hover:text-white transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function AdminMobileBottomNav() {
  return (
    <div
      className="md:hidden fixed bottom-0 inset-x-0 z-30 grid"
      style={{
        gridTemplateColumns: `repeat(${ADMIN_NAV.length}, 1fr)`,
        background: "#1e1b4b",
        borderTop: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {ADMIN_NAV.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            data-testid={`m-${item.testId}`}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-1 py-2 text-[9px] transition-colors ${
                isActive ? "text-indigo-200" : "text-indigo-400"
              }`
            }
          >
            <Icon className="w-5 h-5" />
            <span className="leading-tight text-center">{item.label.split(" ")[0]}</span>
          </NavLink>
        );
      })}
    </div>
  );
}

export default function AdminLayout() {
  const { hasSeen, markTourSeen, restartTour } = useOnboarding();
  const [tourOpen, setTourOpen] = useState(!hasSeen);

  const handleTourClose = () => {
    setTourOpen(false);
    markTourSeen();
  };

  // Expose restartTour via window so Dashboard's QuickStartWidget can trigger it
  useEffect(() => {
    window.__jaryanRestartTour = () => {
      restartTour();
      setTourOpen(true);
    };
    return () => { delete window.__jaryanRestartTour; };
  }, [restartTour]);

  return (
    <div className="flex min-h-screen bg-[#f5f5ff]">
      <AdminSidebar />
      <main className="flex-1 min-w-0 flex flex-col">
        <AdminMobileTopbar />
        <div className="flex-1 min-w-0 pb-16 md:pb-0">
          <Outlet />
        </div>
        <AdminMobileBottomNav />
      </main>

      {/* Product Tour — rendered at layout level so it overlays everything */}
      <ProductTour active={tourOpen} onClose={handleTourClose} />
    </div>
  );
}
