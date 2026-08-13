import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Activity, AlertTriangle, CheckCircle2, Clock, GitBranch, LayoutList,
  Workflow, Search, RefreshCw, Zap, XCircle, Timer, ChevronLeft,
} from "lucide-react";
import { api } from "@/lib/api";
import { fromNow, toJalaliDateTime, toFaNumber } from "@/lib/jalali";
import { getSLAStatus } from "@/lib/sla";
import { getNodeMeta } from "@/lib/workflowUtils";
import ProcessTimeline from "@/components/ProcessTimeline";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_META = {
  running:   { label: "در حال اجرا", chip: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", ring: "#10b981", bar: "from-emerald-400 to-emerald-600" },
  completed: { label: "تکمیل شده",   chip: "bg-indigo-50 text-indigo-700 border-indigo-200", dot: "bg-indigo-500", ring: "#6366f1", bar: "from-indigo-400 to-indigo-600" },
  rejected:  { label: "رد شده",      chip: "bg-rose-50 text-rose-700 border-rose-200", dot: "bg-rose-500", ring: "#f43f5e", bar: "from-rose-400 to-rose-600" },
  stuck:     { label: "متوقف شده",   chip: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500", ring: "#f59e0b", bar: "from-amber-400 to-amber-600" },
};

const TASK_STATUS = {
  pending:     { label: "در انتظار",   cls: "bg-amber-50 text-amber-700 border-amber-200" },
  in_progress: { label: "در حال انجام", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  waiting:     { label: "معطل وابستگی", cls: "bg-neutral-100 text-neutral-600 border-neutral-200" },
  approved:    { label: "تایید شده",   cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  done:        { label: "انجام شده",   cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected:    { label: "رد شده",      cls: "bg-rose-50 text-rose-700 border-rose-200" },
};

const FILTERS = [
  { key: "all", label: "همه" },
  { key: "running", label: "در حال اجرا" },
  { key: "completed", label: "تکمیل شده" },
  { key: "rejected", label: "رد شده" },
];

const DETAIL_TABS = [
  { id: "tree", label: "درخت اجرا", icon: GitBranch },
  { id: "timeline", label: "تایم‌لاین", icon: LayoutList },
];

function ProgressRing({ percent, color }) {
  const r = 34, c = 2 * Math.PI * r;
  const off = c - (percent / 100) * c;
  return (
    <div className="relative w-[88px] h-[88px] shrink-0">
      <svg width="88" height="88" className="-rotate-90">
        <circle cx="44" cy="44" r={r} stroke="currentColor" strokeWidth="8" fill="none" className="text-muted" />
        <circle cx="44" cy="44" r={r} stroke={color} strokeWidth="8" fill="none"
          strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1)" }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="text-lg font-bold text-foreground fa-nums">{toFaNumber(percent)}٪</span>
      </div>
    </div>
  );
}

export default function ProcessMonitoring() {
  const [processes, setProcesses] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailTab, setDetailTab] = useState("tree");
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const loadProcesses = useCallback((bg = false) => {
    if (bg) setRefreshing(true);
    return Promise.all([api.get("/processes"), api.get("/users")])
      .then(([pRes, uRes]) => {
        setProcesses(pRes.data);
        setUsers(uRes.data);
        setActiveId((prev) => prev || (pRes.data[0] ? pRes.data[0].id : null));
      })
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, []);

  useEffect(() => { loadProcesses(); }, [loadProcesses]);

  useEffect(() => {
    if (!activeId) { setDetail(null); return; }
    api.get(`/processes/${activeId}`).then((r) => setDetail(r.data));
    setDetailTab("tree");
  }, [activeId]);

  // Live auto-refresh every 10s
  useEffect(() => {
    const iv = setInterval(() => {
      loadProcesses(true);
      if (activeId) api.get(`/processes/${activeId}`).then((r) => setDetail(r.data)).catch(() => {});
    }, 10000);
    return () => clearInterval(iv);
  }, [loadProcesses, activeId]);

  const stats = useMemo(() => {
    const by = (s) => processes.filter((p) => p.status === s).length;
    return {
      total: processes.length,
      running: by("running"),
      completed: by("completed"),
      attention: by("rejected") + by("stuck"),
    };
  }, [processes]);

  const filtered = useMemo(() => processes.filter((p) =>
    (filter === "all" || p.status === filter) &&
    (q === "" || p.workflow_name.toLowerCase().includes(q.toLowerCase()))
  ), [processes, filter, q]);

  const progressOf = (d) => {
    if (!d?.workflow?.nodes?.length) return 0;
    const total = d.workflow.nodes.filter((n) => n.type !== "trigger").length || d.workflow.nodes.length;
    const done = (d.process.completed_nodes || []).filter((id) => {
      const n = d.workflow.nodes.find((x) => x.id === id);
      return n && n.type !== "trigger";
    }).length;
    return Math.min(100, Math.round((done / total) * 100));
  };

  const overdueCount = (tasks) => tasks.filter((t) => getSLAStatus(t.deadline, t.status) === "overdue").length;

  const STAT_CARDS = [
    { key: "total", label: "کل فرایندها", value: stats.total, icon: Workflow, grad: "from-slate-600 to-slate-800" },
    { key: "running", label: "در حال اجرا", value: stats.running, icon: Zap, grad: "from-emerald-500 to-teal-600" },
    { key: "completed", label: "تکمیل شده", value: stats.completed, icon: CheckCircle2, grad: "from-indigo-500 to-violet-600" },
    { key: "attention", label: "نیازمند توجه", value: stats.attention, icon: AlertTriangle, grad: "from-amber-500 to-orange-600" },
  ];

  return (
    <div className="p-5 lg:p-8 max-w-[1500px] mx-auto" data-testid="monitoring-root">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-3xl p-6 lg:p-7 mb-6 text-white"
        style={{ background: "linear-gradient(135deg,#1e1b4b 0%,#4338ca 55%,#6d28d9 100%)" }}>
        <div className="absolute -top-16 -left-16 w-56 h-56 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-20 right-10 w-64 h-64 rounded-full bg-fuchsia-400/10 blur-3xl" />
        <div className="relative flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 text-indigo-200 text-xs mb-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              پایش زنده • به‌روزرسانی خودکار
            </div>
            <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight flex items-center gap-2">
              <Activity className="w-6 h-6" /> نظارت بر فرایندها
            </h1>
            <p className="text-sm text-indigo-200 mt-1.5">وضعیت لحظه‌ای، پیشرفت، گلوگاه‌ها و مسیر اجرای هر درخواست.</p>
          </div>
          <button
            data-testid="monitoring-refresh"
            onClick={() => loadProcesses(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur text-sm font-medium transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} /> به‌روزرسانی
          </button>
        </div>

        {/* Stat tiles */}
        <div className="relative grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
          {STAT_CARDS.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.key} data-testid={`stat-${s.key}`}
                className="rounded-2xl bg-white/10 backdrop-blur border border-white/15 p-4 flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${s.grad} grid place-items-center shadow-lg shrink-0`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="text-2xl font-extrabold fa-nums leading-none">{toFaNumber(s.value)}</div>
                  <div className="text-[11px] text-indigo-200 mt-1">{s.label}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid lg:grid-cols-[400px_1fr] gap-5">
        {/* ── Process List ── */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              data-testid="monitoring-search" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="جستجوی فرایند…"
              className="text-sm bg-transparent border-0 focus:outline-none w-full text-foreground"
            />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {FILTERS.map((f) => (
              <button key={f.key} data-testid={`monitoring-filter-${f.key}`} onClick={() => setFilter(f.key)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                  filter === f.key ? "bg-brand text-white border-brand shadow-sm" : "bg-card text-muted-foreground border-border hover:border-brand/40"
                }`}>
                {f.label}
              </button>
            ))}
          </div>

          <div className="space-y-2.5">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[76px] rounded-2xl" />)
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground bg-card border border-dashed border-border rounded-2xl">
                فرایندی یافت نشد.
              </div>
            ) : (
              filtered.map((p) => {
                const s = STATUS_META[p.status] || STATUS_META.running;
                const isActive = activeId === p.id;
                return (
                  <button
                    key={p.id} data-testid={`process-row-${p.id}`} onClick={() => setActiveId(p.id)}
                    className={`w-full text-right relative overflow-hidden rounded-2xl border p-4 transition-all ${
                      isActive ? "border-brand bg-brand-soft/40 shadow-[0_6px_20px_rgba(79,70,229,0.12)]" : "border-border bg-card hover:border-brand/40"
                    }`}
                  >
                    <span className={`absolute top-0 bottom-0 right-0 w-1.5 ${s.dot}`} />
                    <div className="flex items-center gap-2 ps-1">
                      <span className={`w-2 h-2 rounded-full ${s.dot} ${p.status === "running" ? "animate-pulse" : ""}`} />
                      <div className="text-sm font-bold text-foreground truncate flex-1">{p.workflow_name}</div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${s.chip}`}>{s.label}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1.5">
                      <Clock className="w-3 h-3" /> آغاز {fromNow(p.created_at)}
                    </div>
                    {p.status === "running" && (
                      <div className="mt-2.5 h-1 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full bg-gradient-to-r ${s.bar} animate-pulse`} style={{ width: "60%" }} />
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── Detail Panel ── */}
        <div className="bg-card border border-border rounded-2xl p-6 min-h-[420px]">
          {!detail ? (
            <div className="h-full grid place-items-center text-center text-sm text-muted-foreground py-20">
              <div>
                <Activity className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
                یک فرایند را از فهرست انتخاب کنید تا جزئیات زنده‌اش را ببینید.
              </div>
            </div>
          ) : (() => {
            const s = STATUS_META[detail.process.status] || STATUS_META.running;
            const percent = progressOf(detail);
            const overdue = overdueCount(detail.tasks);
            const pending = detail.tasks.filter((t) => t.status === "pending").length;
            return (
              <>
                {/* Header with progress ring */}
                <div className="flex items-start gap-5 flex-wrap">
                  <ProgressRing percent={percent} color={s.ring} />
                  <div className="flex-1 min-w-[200px]">
                    <div className="text-xs text-muted-foreground mb-1 fa-nums">{toJalaliDateTime(detail.process.created_at)}</div>
                    <h2 className="text-xl font-extrabold text-foreground flex items-center gap-2">
                      <Workflow className="w-5 h-5 text-brand" /> {detail.process.workflow_name}
                    </h2>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className={`text-[11px] px-2.5 py-1 rounded-full border ${s.chip}`}>{s.label}</span>
                      {overdue > 0 && (
                        <span className="text-[11px] px-2.5 py-1 rounded-full border bg-rose-50 text-rose-700 border-rose-200 inline-flex items-center gap-1">
                          <Timer className="w-3 h-3" /> {toFaNumber(overdue)} تسک دارای تاخیر
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-3 gap-3 mt-6">
                  <Metric label="کل تسک‌ها" value={toFaNumber(detail.tasks.length)} icon={LayoutList} tone="indigo" />
                  <Metric label="در انتظار" value={toFaNumber(pending)} icon={Clock} tone="amber" />
                  <Metric label="گلوگاه (SLA)" value={toFaNumber(overdue)} icon={AlertTriangle} tone={overdue > 0 ? "rose" : "emerald"} />
                </div>

                {/* Tabs */}
                <div className="mt-7 flex items-center gap-1 border-b border-border mb-5">
                  {DETAIL_TABS.map((tab) => {
                    const Icon = tab.icon;
                    const on = detailTab === tab.id;
                    return (
                      <button key={tab.id} data-testid={`detail-tab-${tab.id}`} onClick={() => setDetailTab(tab.id)}
                        className={`flex items-center gap-1.5 text-sm px-3.5 py-2.5 border-b-2 transition-colors ${
                          on ? "border-brand text-brand font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}>
                        <Icon className="w-4 h-4" /> {tab.label}
                      </button>
                    );
                  })}
                </div>

                {/* Execution tree (visual stepper) */}
                {detailTab === "tree" && (
                  <div data-testid="detail-tree">
                    <ol className="relative ms-3 border-s-2 border-dashed border-border ps-6 space-y-5">
                      {detail.workflow?.nodes?.map((node) => {
                        const meta = getNodeMeta(node.data?.nodeType || node.type);
                        const Icon = meta.icon;
                        const nodeTasks = detail.tasks.filter((t) => t.node_id === node.id);
                        const isCurrent = detail.process.current_node_id === node.id;
                        const isDone = (detail.process.completed_nodes || []).includes(node.id) ||
                          nodeTasks.some((t) => ["approved", "done"].includes(t.status));
                        const isRejected = nodeTasks.some((t) => t.status === "rejected");
                        const dotBg = isRejected ? "#f43f5e" : isCurrent ? "#10b981" : isDone ? meta.bar : "#d4d4d8";
                        return (
                          <li key={node.id} data-testid={`tree-${node.id}`} className="relative">
                            <span className="absolute -start-[37px] top-0 w-6 h-6 rounded-full grid place-items-center border-2 border-card shadow"
                              style={{ background: dotBg }}>
                              <Icon className="w-3 h-3 text-white" />
                            </span>
                            <div className={`rounded-xl border p-3 transition-all ${
                              isCurrent ? "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20" : isRejected ? "border-rose-200 bg-rose-50/40 dark:bg-rose-950/20" : "border-border bg-background/40"
                            }`}>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">{meta.label}</span>
                                <div className="text-sm font-semibold text-foreground">{node.label}</div>
                                {isCurrent && (
                                  <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 inline-flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> جاری
                                  </span>
                                )}
                              </div>
                              {nodeTasks.length > 0 && (
                                <ul className="mt-2 space-y-1.5">
                                  {nodeTasks.map((t) => {
                                    const ts = TASK_STATUS[t.status] || TASK_STATUS.pending;
                                    return (
                                      <li key={t.id} className="flex items-center gap-2 text-xs">
                                        <span className="truncate text-muted-foreground flex-1">{t.title}</span>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md border ${ts.cls}`}>{ts.label}</span>
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                )}

                {detailTab === "timeline" && (
                  <div data-testid="detail-timeline" className="animate-in">
                    <ProcessTimeline process={detail.process} tasks={detail.tasks} users={users} />
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

const TONE = {
  indigo: { chip: "bg-indigo-50 text-indigo-600 border-indigo-200", icon: "text-indigo-500" },
  amber: { chip: "bg-amber-50 text-amber-600 border-amber-200", icon: "text-amber-500" },
  rose: { chip: "bg-rose-50 text-rose-600 border-rose-200", icon: "text-rose-500" },
  emerald: { chip: "bg-emerald-50 text-emerald-600 border-emerald-200", icon: "text-emerald-500" },
};

function Metric({ label, value, icon: Icon, tone = "indigo" }) {
  const t = TONE[tone] || TONE.indigo;
  return (
    <div className={`rounded-xl border p-3.5 ${t.chip}`}>
      <div className="flex items-center justify-between text-[11px] opacity-80">
        <span>{label}</span>
        <Icon className={`w-4 h-4 ${t.icon}`} />
      </div>
      <div className="mt-1.5 text-2xl font-extrabold fa-nums text-foreground">{value}</div>
    </div>
  );
}
