import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Sparkles, Inbox, CheckCircle2, Workflow, Clock,
  TrendingUp, ArrowLeft, Activity,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { api } from "@/lib/api";
import { useAuth, isAdmin } from "@/lib/auth";
import { toFaNumber, fromNow, toJalaliShort } from "@/lib/jalali";
import { getSLAStatus, SLA_BADGE } from "@/lib/sla";

const PriorityBadge = ({ p }) => {
  const map = {
    urgent: { label: "فوری", cls: "bg-red-50 text-red-700 border-red-100" },
    high: { label: "بالا", cls: "bg-amber-50 text-amber-700 border-amber-100" },
    medium: { label: "متوسط", cls: "bg-neutral-100 text-neutral-700 border-neutral-200" },
    low: { label: "پایین", cls: "bg-neutral-50 text-neutral-500 border-neutral-200" },
  };
  const v = map[p] || map.medium;
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-md border ${v.cls}`}>{v.label}</span>;
};

const recIcons = { sparkles: Sparkles, clock: Clock, "trending-up": TrendingUp };

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/dashboard").then(r => setData(r.data)).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-10 text-sm text-neutral-400" data-testid="dashboard-loading">در حال بارگذاری…</div>;
  }

  const c = data.counters;

  return (
    <div className="p-6 lg:p-10 max-w-[1400px] mx-auto" data-testid="dashboard-root">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4 mb-8 animate-in">
        <div>
          <div className="text-xs text-neutral-400 mb-1">داشبورد اصلی</div>
          <h1 className="text-3xl font-bold text-neutral-900 tracking-tight">
            سلام {user?.full_name?.split(" ")[0]} 👋
          </h1>
          <p className="text-sm text-neutral-500 mt-1">یک نگاه سریع به وضعیت فرایندهای سازمان شما.</p>
        </div>
        {isAdmin(user) && (
          <Link
            to="/admin/chat"
            data-testid="dashboard-ai-cta"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-brand hover:bg-brand-strong text-white text-sm font-semibold shadow-[0_4px_14px_rgba(79,70,229,0.25)] transition-all"
          >
            <Sparkles className="w-4 h-4" />
            ساخت فرایند با هوش مصنوعی
          </Link>
        )}
      </div>

      {/* Counters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {[
          { icon: Inbox, label: "تسک‌های من", value: c.my_tasks, testId: "counter-my-tasks" },
          { icon: CheckCircle2, label: "تاییدیه‌های در انتظار", value: c.pending_approvals, testId: "counter-approvals" },
          { icon: Activity, label: "فرایندهای در حال اجرا", value: c.running_processes, testId: "counter-running" },
          { icon: Workflow, label: "تعداد فرایندها", value: c.workflows, testId: "counter-workflows" },
        ].map((it) => {
          const Icon = it.icon;
          return (
            <div key={it.label} data-testid={it.testId} className="bg-white border border-neutral-200 rounded-xl p-4">
              <div className="flex items-center justify-between text-neutral-500">
                <Icon className="w-4 h-4" />
                <span className="text-[11px]">{it.label}</span>
              </div>
              <div className="mt-3 text-3xl font-bold text-neutral-900 fa-nums">{toFaNumber(it.value)}</div>
            </div>
          );
        })}
      </div>

      {/* Analytics */}
      <AnalyticsSection />

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
                      <div className="text-sm font-medium text-neutral-900 truncate">{t.title}</div>
                      <div className="text-[11px] text-neutral-500 mt-0.5">{t.workflow_name}</div>
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
                      <div className="text-[11px] text-neutral-500 fa-nums hidden sm:block">{toJalaliShort(t.deadline)}</div>
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
                    <CheckCircle2 className="w-4 h-4 text-neutral-400" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-neutral-900 truncate">{t.title}</div>
                      <div className="text-[11px] text-neutral-500 mt-0.5">{t.workflow_name}</div>
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
                      <div className="text-sm font-medium text-neutral-900 truncate">{p.workflow_name}</div>
                      <div className="text-[11px] text-neutral-500 mt-0.5">شروع: {fromNow(p.created_at)}</div>
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
                  <li key={r.id} data-testid={`rec-${r.id}`} className="group rounded-lg border border-neutral-200 hover:border-brand hover:bg-brand-soft transition-all p-3 cursor-pointer">
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-md bg-gradient-to-br from-brand to-brand-strong text-white grid place-items-center shrink-0 shadow-sm">
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-neutral-900">{r.title}</div>
                        <div className="text-[11px] text-neutral-500 mt-1 leading-5">{r.reason}</div>
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
                    <div className="text-sm text-neutral-900 leading-6">{a.summary}</div>
                    <div className="text-[11px] text-neutral-400">
                      <span className="font-medium text-neutral-500">{a.actor_name}</span>
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
    <section data-testid={testId} className={`rounded-xl border border-neutral-200 ${subtle ? "bg-neutral-50" : "bg-white"} p-5`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
        {link && (
          <Link to={link} className="text-[11px] text-neutral-500 hover:text-neutral-900 inline-flex items-center gap-1">
            {linkLabel} <ArrowLeft className="w-3 h-3" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Empty({ text }) {
  return <div className="text-sm text-neutral-400 py-6 text-center">{text}</div>;
}

// ─────────────────────────────────────────────
// Analytics Section (independent state — errors here don't break the dashboard)
// ─────────────────────────────────────────────
const STATUS_PIE = {
  pending:     { label: "در انتظار",   color: "#f59e0b" },
  in_progress: { label: "در حال انجام", color: "#3b82f6" },
  approved:    { label: "تایید شده",   color: "#10b981" },
  rejected:    { label: "رد شده",      color: "#ef4444" },
  done:        { label: "انجام شده",   color: "#737373" },
};

function formatDuration(minutes) {
  if (minutes === null || minutes === undefined) return "داده کافی ندارد";
  if (minutes < 60) return `${toFaNumber(Math.round(minutes))} دقیقه`;
  if (minutes < 1440) {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return `${toFaNumber(h)} ساعت و ${toFaNumber(m)} دقیقه`;
  }
  const d = Math.floor(minutes / 1440);
  const h = Math.round((minutes % 1440) / 60);
  return `${toFaNumber(d)} روز و ${toFaNumber(h)} ساعت`;
}

function AnalyticsSection() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.get("/analytics/dashboard")
      .then(r => setData(r.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-8" data-testid="analytics-loading">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-64 animate-pulse bg-neutral-100 rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-8" data-testid="analytics-error">
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          خطا در بارگذاری آمار تحلیلی
        </div>
      </div>
    );
  }

  const pieData = Object.entries(data.task_status_dist || {}).map(([k, v]) => ({
    name: (STATUS_PIE[k] || { label: k }).label,
    value: v,
    color: (STATUS_PIE[k] || { color: "#ccc" }).color,
  }));
  const pieTotal = pieData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="mt-10">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-4 h-4 text-neutral-500" />
        <h2 className="text-sm font-semibold text-neutral-900">آمار تحلیلی سازمان</h2>
        <span className="text-[11px] text-neutral-400">۳۰ روز گذشته</span>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-neutral-200 rounded-xl p-5" data-testid="chart-daily-processes">
          <div className="text-sm font-semibold text-neutral-900 mb-1">فرایندهای راه‌اندازی‌شده</div>
          <div className="text-[11px] text-neutral-400 mb-4">به تفکیک روز شمسی</div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.daily_processes} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "#737373" }}
                tickFormatter={(d) => {
                  const p = String(d).split("-");
                  return toFaNumber(`${p[1]}/${p[2]}`);
                }}
                interval={4}
              />
              <YAxis tick={{ fontSize: 10, fill: "#737373" }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, fontFamily: "inherit" }}
                labelFormatter={(d) => toFaNumber(d)}
                formatter={(v) => [toFaNumber(v), "فرایند"]}
              />
              <Line type="monotone" dataKey="count" stroke="#4f46e5" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-5" data-testid="chart-task-status">
          <div className="text-sm font-semibold text-neutral-900 mb-1">توزیع وضعیت تسک‌ها</div>
          <div className="text-[11px] text-neutral-400 mb-4">کل تسک‌های سازمان</div>
          {pieTotal === 0 ? (
            <div className="h-[220px] grid place-items-center text-sm text-neutral-400">داده‌ای موجود نیست</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40}>
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip
                  contentStyle={{ fontSize: 12, fontFamily: "inherit" }}
                  formatter={(v, n) => [toFaNumber(v), n]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Cards row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <div className="bg-white border border-neutral-200 rounded-xl p-5" data-testid="top-users-card">
          <div className="text-sm font-semibold text-neutral-900 mb-4">پرکارترین کاربران</div>
          {(!data.top_users || data.top_users.length === 0) ? (
            <div className="text-sm text-neutral-400 py-4 text-center">داده‌ای موجود نیست</div>
          ) : (
            <ul className="space-y-3">
              {data.top_users.map((u) => (
                <li key={u.user_id} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full grid place-items-center text-white text-xs font-medium bg-brand">
                    {(u.full_name || "؟")[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-neutral-900 truncate">{u.full_name}</div>
                    <div className="text-[11px] text-neutral-500">{u.role || "—"}</div>
                  </div>
                  <div className="text-sm font-bold text-neutral-900 fa-nums">{toFaNumber(u.task_count)} تسک</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-5 flex flex-col justify-center" data-testid="avg-completion-card">
          <div className="flex items-center gap-2 text-neutral-500">
            <Clock className="w-4 h-4" />
            <span className="text-[11px]">میانگین زمان تکمیل فرایند</span>
          </div>
          <div className="mt-3 text-3xl font-bold text-neutral-900">
            {formatDuration(data.avg_completion_minutes)}
          </div>
          <div className="mt-1 text-[11px] text-neutral-400">بر اساس فرایندهای تکمیل‌شده در ۳۰ روز گذشته</div>
        </div>
      </div>
    </div>
  );
}
