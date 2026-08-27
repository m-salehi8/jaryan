import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LayoutDashboard, Sparkles, Workflow, FileText, Activity, LogOut, Users, Shield, BarChart2, Moon, Sun } from "lucide-react";
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
  const [isHovered, setIsHovered] = useState(false);

  return (
    <aside
      data-testid="admin-sidebar"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="hidden md:flex flex-col h-screen fixed top-0 right-0 z-40 transition-all pt-5 duration-300 ease-in-out"
      style={{
        width: isHovered ? "260px" : "72px",
        background: "linear-gradient(180deg, #1e1b4b 0%, #312e81 100%)",
        borderLeft: "1px solid rgba(255,255,255,0.08)",
        boxShadow: isHovered ? "0 25px 50px -12px rgba(15, 10, 40, 0.45), 0 0 0 1px rgba(255,255,255,0.1)" : "none",
      }}>
      {/* Brand */}
      <div className="h-[76px] px-[14px] flex items-center shrink-0 border-b border-white/5">
        <div className="flex items-center w-full">
          <div className="w-11 h-11 rounded-xl bg-indigo-950/70 border border-white/15 flex items-center justify-center p-1.5 shadow-md shrink-0">
            <img src="/images/logo.webp" alt="روند" className="w-full h-full object-contain drop-shadow" />
          </div>
          <div
            className={`ms-3 flex-1 min-w-0 transition-all duration-300 ${
              isHovered ? "opacity-100 translate-x-0" : "opacity-0 translate-x-2 pointer-events-none w-0 overflow-hidden"
            }`}>
            <div className="text-sm font-bold text-white leading-tight truncate">روند</div>
            <div className="text-[11px] text-indigo-300 truncate">پنل مدیریت</div>
          </div>
        </div>
      </div>

      {/* Nav links */}
      <nav className="px-[14px] flex-1 py-3 space-y-1 overflow-y-auto overflow-x-hidden scrollbar-none">
        {ADMIN_NAV.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              data-testid={item.testId}
              data-tour-id={item.tourId || undefined}
              title={!isHovered ? item.label : undefined}
              className={({ isActive }) =>
                `group/item relative flex items-center h-11 rounded-xl transition-all duration-200 select-none ${
                  isActive ? "bg-white/15 text-white shadow-sm font-semibold" : "text-indigo-200 hover:bg-white/10 hover:text-white"
                }`
              }>
              <div className="w-11 h-11 flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 transition-transform duration-200 group-hover/item:scale-110" />
              </div>
              <div
                className={`ms-1 flex-1 min-w-0 pe-3 transition-all duration-300 ${
                  isHovered ? "opacity-100 translate-x-0" : "opacity-0 translate-x-2 pointer-events-none w-0 overflow-hidden"
                }`}>
                <span className="text-sm truncate block">{item.label}</span>
              </div>
            </NavLink>
          );
        })}
      </nav>

      {/* Footer / User info */}
      <div className="p-3 border-t shrink-0 relative min-h-[64px] flex items-center" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        {/* Collapsed single logout icon */}
        <div
          className={`absolute inset-0 flex items-center justify-center transition-all duration-200 ${
            isHovered ? "opacity-0 pointer-events-none scale-90" : "opacity-100 scale-100"
          }`}>
          <button
            data-testid="admin-logout-btn-collapsed"
            onClick={() => {
              logout();
              navigate("/login");
            }}
            className="w-11 h-11 rounded-xl flex items-center justify-center text-indigo-300 hover:text-rose-300 hover:bg-white/10 transition-colors"
            title="خروج از حساب">
            <LogOut className="w-5 h-5" />
          </button>
        </div>

        {/* Expanded full user footer */}
        <div
          className={`w-full flex items-center justify-between gap-2 px-1 transition-all duration-300 ${
            isHovered ? "opacity-100 translate-x-0" : "opacity-0 translate-x-3 pointer-events-none"
          }`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full text-white text-xs font-bold grid place-items-center shrink-0 shadow-sm" style={{ background: user?.avatar_color || "#6366f1" }}>
              {user?.full_name?.[0] || "؟"}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-white truncate leading-tight">{user?.full_name}</div>
              <div className="text-[10px] text-indigo-300 truncate font-mono">{user?.email}</div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={toggleTheme}
              data-testid="admin-theme-toggle"
              className="p-1.5 rounded-lg text-indigo-300 hover:text-white hover:bg-white/10 transition-colors"
              title="تغییر پوسته">
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              data-testid="admin-logout-btn"
              onClick={() => {
                logout();
                navigate("/login");
              }}
              className="p-1.5 rounded-lg text-indigo-300 hover:text-rose-300 hover:bg-white/10 transition-colors"
              title="خروج">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
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
    <div className="md:hidden flex items-center justify-between px-4 py-3 sticky top-0 z-30" style={{ background: "#1e1b4b", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-indigo-950/70 border border-white/15 flex items-center justify-center p-1 shadow-sm shrink-0">
          <img src="/images/logo.webp" alt="روند" className="w-full h-full object-contain drop-shadow" />
        </div>
        <div>
          <div className="text-sm font-bold text-white leading-tight">روند</div>
          <div className="text-[10px] text-indigo-300">پنل مدیریت</div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={toggleTheme} className="p-2 rounded-md text-indigo-300 hover:text-white transition-colors">
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        <button
          onClick={() => {
            logout();
            navigate("/login");
          }}
          className="p-2 rounded-md text-indigo-300 hover:text-white transition-colors">
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
      }}>
      {ADMIN_NAV.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            data-testid={`m-${item.testId}`}
            className={({ isActive }) => `flex flex-col items-center justify-center gap-1 py-2 text-[9px] transition-colors ${isActive ? "text-indigo-200" : "text-indigo-400"}`}>
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
    return () => {
      delete window.__jaryanRestartTour;
    };
  }, [restartTour]);

  return (
    <div className="flex min-h-screen bg-[#f5f5ff] dark:bg-background">
      {/* Fixed spacer for collapsed sidebar so layout never shifts on hover */}
      <div className="hidden md:block w-[72px] shrink-0" aria-hidden="true" />
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
