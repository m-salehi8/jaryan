import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Sparkles, Inbox, CheckCircle2, Workflow, Clock,
  TrendingUp, ArrowLeft, Activity,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

import { api } from "@/lib/api";
import { useAuth, isAdmin } from "@/lib/auth";
import { toFaNumber, fromNow, toJalaliShort } from "@/lib/jalali";
import { getSLAStatus, SLA_BADGE } from "@/lib/sla";
import { useOnboarding } from "@/hooks/useOnboarding";
import QuickStartWidget from "@/components/onboarding/QuickStartWidget";

const PriorityBadge = ({ p }) => {
  const map = {
    urgent: { label: "فوری", cls: "bg-red-50 text-red-700 border-red-100" },
    high: { label: "بالا", cls: "bg-amber-50 text-amber-700 border-amber-100" },
    medium: { label: "متوسط", cls: "bg-muted text-muted-foreground border-border" },
    low: { label: "پایین", cls: "bg-muted text-muted-foreground border-border" },
  };
  const v = map[p] || map.medium;
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-md border ${v.cls}`}>{v.label}</span>;
};

const recIcons = { sparkles: Sparkles, clock: Clock, "trending-up": TrendingUp };

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const { widgetDismissed, dismissWidget } = useOnboarding();

  useEffect(() => {
    api.get("/dashboard").then(r => setData(r.data)).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-6 lg:p-10 max-w-[1400px] mx-auto space-y-8" data-testid="dashboard-loading">
        <div className="space-y-2">
          <Skeleton className="w-24 h-4" />
          <Skeleton className="w-48 h-8" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  const c = data.counters;

  return (
    <div className="p-6 lg:p-10 max-w-[1400px] mx-auto" data-testid="dashboard-root" data-tour-id="tour-dashboard">

      {/* Quick Start Widget — admin only, dismissible */}
      {isAdmin(user) && !widgetDismissed && (
        <QuickStartWidget
          onDismiss={dismissWidget}
          onStartTour={() => window.__jaryanRestartTour?.()}
        />
      )}

      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl p-6 lg:p-7 mb-6 text-white bg-slate-900 border border-slate-800 shadow-xl shadow-indigo-950/10">
        {/* Subtle glowing ambient accents */}
        <div className="absolute top-0 right-1/4 w-80 h-80 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 left-10 w-60 h-60 bg-violet-600/10 rounded-full blur-2xl pointer-events-none" />
        
        {/* Subtle grid pattern overlay */}
        <div 
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "24px 24px"
          }}
        />

        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-400/20 text-[11px] font-medium text-indigo-300 backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
              داشبورد هوشمند فرایندها
            </div>
            <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight text-white">
              سلام {user?.full_name ? user.full_name.split(" ")[0] : "کاربر گرامی"} 👋
            </h1>
            <p className="text-xs lg:text-sm text-slate-300 leading-relaxed max-w-xl">
              خلاصه وضعیت کارتابل، تاییدیه‌های در انتظار و فرایندهای فعال سازمان شما.
            </p>
          </div>

          <div className="shrink-0">
            {isAdmin(user) ? (
              <Link
                to="/admin/chat"
                data-testid="dashboard-ai-cta"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white text-xs lg:text-sm font-semibold shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 border border-indigo-400/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <Sparkles className="w-4 h-4 text-indigo-200" />
                ساخت فرایند با هوش مصنوعی
              </Link>
            ) : (
              <Link
                to="/new"
                data-testid="dashboard-new-request-cta"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white text-xs lg:text-sm font-semibold shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 border border-indigo-400/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <Sparkles className="w-4 h-4 text-indigo-200" />
                ثبت درخواست جدید
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-8">
        {[
          {
            icon: Inbox,
            label: "تسک‌های من",
            value: c.my_tasks,
            testId: "counter-my-tasks",
            iconBg: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
          },
          {
            icon: CheckCircle2,
            label: "تاییدیه‌های در انتظار",
            value: c.pending_approvals,
            testId: "counter-approvals",
            iconBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
          },
          {
            icon: Activity,
            label: "فرایندهای در حال اجرا",
            value: c.running_processes,
            testId: "counter-running",
            iconBg: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
          },
          {
            icon: Workflow,
            label: "تعداد فرایندها",
            value: c.workflows,
            testId: "counter-workflows",
            iconBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
          },
        ].map((it) => {
          const Icon = it.icon;
          return (
            <div
              key={it.label}
              data-testid={it.testId}
              className="bg-card border border-border/80 hover:border-border rounded-xl p-4 transition-all duration-200 hover:shadow-[0_4px_16px_rgba(0,0,0,0.04)]"
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <span className="text-xs font-medium text-muted-foreground block truncate">
                    {it.label}
                  </span>
                  <div className="mt-1 text-2xl font-extrabold text-foreground fa-nums tracking-tight">
                    {toFaNumber(it.value)}
                  </div>
                </div>
                <div className={`w-10 h-10 rounded-xl border ${it.iconBg} grid place-items-center shrink-0`}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Analytics Link */}
      {isAdmin(user) && (
        <div className="mb-8">
          <Link
            to="/admin/analytics"
            className="flex items-center justify-between p-4 rounded-xl border border-brand/20 bg-brand-soft/30 hover:bg-brand-soft transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-brand/10 text-brand grid place-items-center">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">گزارش‌ها و تحلیل‌های پیشرفته</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">مشاهده عملکرد پرسنل، دیتای فرم‌ها و نمودارها</div>
              </div>
            </div>
            <div className="text-brand text-sm font-medium flex items-center gap-1">
              مشاهده <ArrowLeft className="w-4 h-4" />
            </div>
          </Link>
        </div>
      )}
      {/* Bento grid */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* My tasks + approvals */}
        <div className="lg:col-span-2 space-y-4">
          <SectionCard title="تسک‌های من" link="/inbox" linkLabel="مشاهده کارتابل" testId="section-my-tasks">
            {data.my_tasks.length === 0 ? (
              <Empty text="هیچ تسکی برای شما در انتظار نیست." />
            ) : (
              <ul className="divide-y divide-neutral-100">
                {data.my_tasks.map(t => (
                  <li key={t.id} data-testid={`my-task-${t.id}`} className="row-hover py-3 px-1 flex items-center gap-3">
                    <div className="w-1 h-8 rounded bg-neutral-200" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{t.title}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{t.workflow_name}</div>
                    </div>
                    <PriorityBadge p={t.priority} />
                    {(() => {
                      const sla = getSLAStatus(t.deadline, t.status);
                      return sla ? (
                        <span
                          data-testid={`sla-${sla}-${t.id}`}
                          className={`text-[10px] px-1.5 py-0.5 rounded-md border ${SLA_BADGE[sla].cls}`}
                        >
                          {SLA_BADGE[sla].label}
                        </span>
                      ) : null;
                    })()}
                    {t.deadline && (
                      <div className="text-[11px] text-muted-foreground fa-nums hidden sm:block">{toJalaliShort(t.deadline)}</div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="تاییدیه‌های در انتظار" testId="section-approvals">
            {data.pending_approvals.length === 0 ? (
              <Empty text="درخواست تاییدی وجود ندارد." />
            ) : (
              <ul className="divide-y divide-neutral-100">
                {data.pending_approvals.map(t => (
                  <li key={t.id} data-testid={`approval-${t.id}`} className="row-hover py-3 px-1 flex items-center gap-3">
                    <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{t.title}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{t.workflow_name}</div>
                    </div>
                    <PriorityBadge p={t.priority} />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="فرایندهای زنده" link={isAdmin(user) ? "/admin/monitoring" : "/monitoring"} linkLabel="پایش زنده" testId="section-running">
            {data.running_processes.length === 0 ? (
              <Empty text="هیچ فرایندی در حال اجرا نیست." />
            ) : (
              <ul className="divide-y divide-neutral-100">
                {data.running_processes.map(p => (
                  <li key={p.id} data-testid={`running-${p.id}`} className="py-3 px-1 flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{p.workflow_name}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">شروع: {fromNow(p.created_at)}</div>
                    </div>
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md px-1.5 py-0.5">در حال اجرا</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        {/* Right column: AI recs + activities */}
        <div className="space-y-4">
          <SectionCard title="پیشنهادهای هوش مصنوعی" testId="section-recommendations" subtle>
            <ul className="space-y-3">
              {data.recommendations.map((r) => {
                const Icon = recIcons[r.icon] || Sparkles;
                return (
                  <li key={r.id} data-testid={`rec-${r.id}`} className="group rounded-lg border border-border hover:border-brand hover:bg-brand-soft transition-all p-3 cursor-pointer">
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-md bg-gradient-to-br from-brand to-brand-strong text-white grid place-items-center shrink-0 shadow-sm">
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-foreground">{r.title}</div>
                        <div className="text-[11px] text-muted-foreground mt-1 leading-5">{r.reason}</div>
                      </div>
                      <ArrowLeft className="w-3.5 h-3.5 text-neutral-300 group-hover:text-brand transition-colors" />
                    </div>
                  </li>
                );
              })}
            </ul>
          </SectionCard>

          <SectionCard title="فعالیت‌های اخیر" testId="section-activities">
            <ul className="space-y-3">
              {data.activities.map(a => (
                <li key={a.id} className="flex items-start gap-3" data-testid={`activity-${a.id}`}>
                  <div className="w-1.5 h-1.5 rounded-full bg-neutral-300 mt-2" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-foreground leading-6">{a.summary}</div>
                    <div className="text-[11px] text-muted-foreground">
                      <span className="font-medium text-muted-foreground">{a.actor_name}</span>
                      <span className="mx-1.5">•</span>
                      {fromNow(a.created_at)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function SectionCard({ title, link, linkLabel, children, testId, subtle }) {
  return (
    <section data-testid={testId} className={`rounded-2xl border border-border ${subtle ? "bg-muted" : "bg-card"} p-5 hover:shadow-[0_6px_20px_rgba(0,0,0,0.05)] transition-shadow`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {link && (
          <Link to={link} className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            {linkLabel} <ArrowLeft className="w-3 h-3" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Empty({ text }) {
  return <div className="text-sm text-muted-foreground py-6 text-center">{text}</div>;
}


