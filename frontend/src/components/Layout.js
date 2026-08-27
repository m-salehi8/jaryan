import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Inbox, Activity, LogOut, LayoutDashboard, Menu, Moon, Sun, Smartphone, PlusCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useBadge } from "@/lib/badgeContext";
import { useTheme } from "@/lib/themeContext";
import { toFaNumber } from "@/lib/jalali";

const NAV = [
  { to: "/", icon: LayoutDashboard, label: "داشبورد", end: true, testId: "nav-dashboard" },
  { to: "/new", icon: PlusCircle, label: "درخواست جدید", testId: "nav-new" },
  { to: "/inbox", icon: Inbox, label: "کارتابل", testId: "nav-inbox" },
  { to: "/monitoring", icon: Activity, label: "پایش زنده", testId: "nav-monitoring" },
];

function Sidebar() {
  const { user, logout } = useAuth();
  const { pendingCount } = useBadge();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [isHovered, setIsHovered] = useState(false);

  return (
    <aside
      data-testid="sidebar"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="hidden md:flex flex-col h-screen fixed top-0 right-0 z-40 bg-card border-l border-border transition-all duration-300 ease-in-out"
      style={{
        width: isHovered ? "260px" : "72px",
        boxShadow: isHovered
          ? "0 20px 45px -10px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(0,0,0,0.06)"
          : "none",
      }}
    >
      {/* Brand */}
      <div className="h-[76px] px-[14px] flex items-center shrink-0 border-b border-border/50">
        <div className="flex items-center w-full">
          <div className="w-11 h-11 rounded-xl bg-neutral-900 border border-border flex items-center justify-center p-1.5 shadow-sm shrink-0">
            <img src="/images/logo.webp" alt="روند" className="w-full h-full object-contain" />
          </div>
          <div
            className={`ms-3 flex-1 min-w-0 transition-all duration-300 ${
              isHovered ? "opacity-100 translate-x-0" : "opacity-0 translate-x-2 pointer-events-none w-0 overflow-hidden"
            }`}
          >
            <div className="text-sm font-bold text-foreground leading-tight truncate">روند</div>
            <div className="text-[11px] text-muted-foreground truncate">پلتفرم اتوماسیون فرایند</div>
          </div>
        </div>
      </div>

      {/* Nav links */}
      <nav className="px-[14px] flex-1 py-3 space-y-1 overflow-y-auto overflow-x-hidden scrollbar-none">
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              data-testid={item.testId}
              title={!isHovered ? item.label : undefined}
              className={({ isActive }) =>
                `group/item relative flex items-center h-11 rounded-xl transition-all duration-200 select-none ${
                  isActive
                    ? "bg-brand text-white shadow-[0_4px_14px_rgba(79,70,229,0.25)] font-semibold"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`
              }
            >
              <div className="w-11 h-11 flex items-center justify-center shrink-0 relative">
                <Icon className="w-5 h-5 transition-transform duration-200 group-hover/item:scale-110" />
                {!isHovered && pendingCount > 0 && item.to === "/inbox" && (
                  <span className="absolute top-2 end-2 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-card" />
                )}
              </div>

              <div
                className={`ms-1 flex-1 min-w-0 pe-3 flex items-center justify-between transition-all duration-300 ${
                  isHovered
                    ? "opacity-100 translate-x-0"
                    : "opacity-0 translate-x-2 pointer-events-none w-0 overflow-hidden"
                }`}
              >
                <span className="text-sm truncate">{item.label}</span>
                {pendingCount > 0 && item.to === "/inbox" && (
                  <span
                    data-testid="badge-inbox"
                    className="ms-2 text-[10px] bg-red-500 text-white rounded-full px-1.5 min-w-[18px] text-center leading-5 shrink-0"
                  >
                    {pendingCount > 99 ? "+۹۹" : toFaNumber(pendingCount)}
                  </span>
                )}
              </div>
            </NavLink>
          );
        })}

        <a
          href="/mobile"
          target="_blank"
          rel="noreferrer"
          data-testid="nav-mobile"
          title={!isHovered ? "نمای موبایل" : undefined}
          className="group/item relative flex items-center h-11 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200 select-none"
        >
          <div className="w-11 h-11 flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5 transition-transform duration-200 group-hover/item:scale-110" />
          </div>
          <div
            className={`ms-1 flex-1 min-w-0 pe-3 transition-all duration-300 ${
              isHovered
                ? "opacity-100 translate-x-0"
                : "opacity-0 translate-x-2 pointer-events-none w-0 overflow-hidden"
            }`}
          >
            <span className="text-sm truncate">نمای موبایل</span>
          </div>
        </a>
      </nav>

      {/* Footer / User info */}
      <div className="p-3 border-t border-border shrink-0 relative min-h-[64px] flex items-center">
        {/* Collapsed single logout icon */}
        <div
          className={`absolute inset-0 flex items-center justify-center transition-all duration-200 ${
            isHovered ? "opacity-0 pointer-events-none scale-90" : "opacity-100 scale-100"
          }`}
        >
          <button
            data-testid="logout-btn-collapsed"
            onClick={() => { logout(); navigate("/login"); }}
            className="w-11 h-11 rounded-xl flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
            title="خروج از حساب"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>

        {/* Expanded full user footer */}
        <div
          className={`w-full flex items-center justify-between gap-2 px-1 transition-all duration-300 ${
            isHovered ? "opacity-100 translate-x-0" : "opacity-0 translate-x-3 pointer-events-none"
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-8 h-8 rounded-full text-white text-xs font-medium grid place-items-center shrink-0 shadow-sm"
              style={{ background: user?.avatar_color || "#737373" }}
            >
              {user?.full_name?.[0] || "؟"}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground truncate leading-tight">{user?.full_name}</div>
              <div className="text-[11px] text-muted-foreground truncate">{user?.role}</div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="تغییر پوسته"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              data-testid="logout-btn"
              onClick={() => { logout(); navigate("/login"); }}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
              title="خروج"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function MobileTopbar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  return (
    <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-card sticky top-0 z-30">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-neutral-900 border border-border flex items-center justify-center p-1 shadow-sm shrink-0">
          <img src="/images/logo.webp" alt="روند" className="w-full h-full object-contain" />
        </div>
        <span className="text-[10px] text-brand font-bold bg-brand/10 px-2 py-1 rounded-md">نسخه کاربری</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={toggleTheme}
          className="p-2 rounded-md text-muted-foreground hover:bg-muted transition-colors"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        <button
          onClick={() => { logout(); navigate("/login"); }}
          className="p-2 rounded-md hover:bg-muted text-muted-foreground transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
        <div
          className="w-7 h-7 rounded-full grid place-items-center text-white text-[11px] ms-1"
          style={{ background: user?.avatar_color || "#737373" }}
        >
          {user?.full_name?.[0]}
        </div>
      </div>
    </div>
  );
}

function MobileBottomNav() {
  const { pendingCount } = useBadge();
  return (
    <div className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-card border-t border-border grid grid-cols-4">
      {NAV.slice(0, 5).map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            data-testid={`m-${item.testId}`}
            className={({ isActive }) =>
              `relative flex flex-col items-center justify-center gap-1 py-2 text-[10px] ${
                isActive ? "text-foreground" : "text-muted-foreground"
              }`
            }
          >
            <span className="relative">
              <Icon className="w-5 h-5" />
              {item.to === "/inbox" && pendingCount > 0 && (
                <span
                  data-testid="m-badge-inbox"
                  className="absolute -top-1.5 -end-1.5 text-[9px] bg-red-500 text-white rounded-full px-1 min-w-[16px] h-[16px] grid place-items-center leading-none"
                >
                  {pendingCount > 99 ? "+۹۹" : toFaNumber(pendingCount)}
                </span>
              )}
            </span>
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </div>
  );
}

export default function Layout() {
  return (
    <div className="flex min-h-screen bg-[#fafafa] dark:bg-background">
      {/* Fixed spacer for collapsed sidebar so layout never shifts on hover */}
      <div className="hidden md:block w-[72px] shrink-0" aria-hidden="true" />
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
