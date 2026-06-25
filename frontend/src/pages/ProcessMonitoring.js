import { useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock, Workflow, X } from "lucide-react";
import { api } from "@/lib/api";
import { fromNow, toJalaliDateTime, toFaNumber } from "@/lib/jalali";
import { getSLAStatus } from "@/lib/sla";

const STATUS_META = {
  running:   { label: "در حال اجرا", cls: "bg-emerald-50 text-emerald-700 border-emerald-100", dot: "bg-emerald-500 animate-pulse" },
  completed: { label: "تکمیل شده",   cls: "bg-neutral-100 text-neutral-600 border-neutral-200", dot: "bg-neutral-400" },
  rejected:  { label: "رد شده",      cls: "bg-red-50 text-red-700 border-red-100", dot: "bg-red-500" },
  stuck:     { label: "متوقف شده",   cls: "bg-amber-50 text-amber-700 border-amber-100", dot: "bg-amber-500" },
};

export default function ProcessMonitoring() {
  const [processes, setProcesses] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/processes").then(r => {
      setProcesses(r.data);
      if (r.data[0]) setActiveId(r.data[0].id);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!activeId) { setDetail(null); return; }
    api.get(`/processes/${activeId}`).then(r => setDetail(r.data));
  }, [activeId]);

  // Compute simple SLA: tasks past deadline still pending
  const computeBottleneck = (tasks) => {
    const now = Date.now();
    return tasks.filter(t => t.deadline && new Date(t.deadline).getTime() < now && t.status === "pending").length;
  };

  return (
    <div className="p-6 lg:p-10 max-w-[1400px] mx-auto" data-testid="monitoring-root">
      <div className="mb-6">
        <div className="text-xs text-neutral-400">پایش زنده</div>
        <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
          <Activity className="w-5 h-5" /> نظارت بر فرایندها
        </h1>
        <p className="text-sm text-neutral-500 mt-1">گلوگاه‌ها، SLA و درخت وضعیت تسک‌ها به‌صورت زنده.</p>
      </div>

      <div className="grid lg:grid-cols-[420px_1fr] gap-4">
        {/* List */}
        <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden h-fit">
          <div className="px-4 py-3 border-b border-neutral-200 text-xs text-neutral-500">
            <span className="fa-nums">{toFaNumber(processes.length)}</span> فرایند
          </div>
          {loading ? (
            <div className="p-10 text-center text-sm text-neutral-400">در حال بارگذاری…</div>
          ) : processes.length === 0 ? (
            <div className="p-10 text-center text-sm text-neutral-400">فرایندی در جریان نیست.</div>
          ) : (
            <ul>
              {processes.map((p) => {
                const s = STATUS_META[p.status] || STATUS_META.running;
                return (
                  <li
                    key={p.id}
                    data-testid={`process-row-${p.id}`}
                    onClick={() => setActiveId(p.id)}
                    className={`px-4 py-3 border-b border-neutral-100 cursor-pointer last:border-0 ${
                      activeId === p.id ? "bg-neutral-100" : "hover:bg-neutral-50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                      <div className="text-sm font-medium text-neutral-900 truncate flex-1 flex items-center gap-1.5">
                        {p.workflow_name}
                        {detail?.process?.id === p.id && detail?.tasks?.some(t => getSLAStatus(t.deadline, t.status) === "overdue") && (
                          <span className="w-2 h-2 rounded-full bg-red-500 inline-block shrink-0" />
                        )}
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md border ${s.cls}`}>{s.label}</span>
                    </div>
                    <div className="text-[11px] text-neutral-500 mt-1.5 flex items-center gap-2">
                      <Clock className="w-3 h-3" /> آغاز {fromNow(p.created_at)}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Detail */}
        <div className="bg-white border border-neutral-200 rounded-xl p-6 min-h-[300px]">
          {!detail ? (
            <div className="text-sm text-neutral-400">یک فرایند را انتخاب کن.</div>
          ) : (
            <>
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <div className="text-xs text-neutral-400 mb-1">{toJalaliDateTime(detail.process.created_at)}</div>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Workflow className="w-4 h-4" /> {detail.process.workflow_name}
                  </h2>
                </div>
                <span className={`text-[11px] px-2 py-0.5 rounded-md border ${STATUS_META[detail.process.status]?.cls}`}>
                  {STATUS_META[detail.process.status]?.label || detail.process.status}
                </span>
              </div>

              <div className="grid sm:grid-cols-3 gap-3 mt-5">
                <Metric label="تسک‌ها" value={toFaNumber(detail.tasks.length)} icon={CheckCircle2} />
                <Metric label="در انتظار" value={toFaNumber(detail.tasks.filter(t => t.status === "pending").length)} icon={Clock} />
                <Metric label="گلوگاه (SLA)" value={toFaNumber(computeBottleneck(detail.tasks))} icon={AlertTriangle} accent />
              </div>

              {/* Status tree (workflow nodes + their tasks) */}
              <div className="mt-7">
                <div className="text-xs text-neutral-500 mb-3">درخت اجرای فرایند</div>
                <ol className="relative ms-2 border-s border-neutral-200 ps-5 space-y-4">
                  {detail.workflow?.nodes?.map((node) => {
                    const nodeTasks = detail.tasks.filter(t => t.node_id === node.id);
                    const isCurrent = detail.process.current_node_id === node.id;
                    return (
                      <li key={node.id} data-testid={`tree-${node.id}`} className="relative">
                        <span className={`absolute -start-[27px] top-1 w-3 h-3 rounded-full border-2 border-white ${
                          isCurrent ? "bg-emerald-500" : nodeTasks.some(t => ["approved","done"].includes(t.status)) ? "bg-neutral-700" : "bg-neutral-300"
                        }`} />
                        <div className="flex items-center gap-2">
                          <div className="text-[10px] text-neutral-400 mono uppercase">{node.type}</div>
                          <div className="text-sm font-medium text-neutral-900">{node.label}</div>
                          {isCurrent && <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md px-1.5 py-0.5">جاری</span>}
                        </div>
                        {nodeTasks.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {nodeTasks.map(t => (
                              <li key={t.id} className="text-xs text-neutral-500 flex items-center gap-2">
                                <span className="w-1 h-1 rounded-full bg-neutral-300" />
                                <span className="truncate">{t.title}</span>
                                <span className="text-neutral-400">— {t.status}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, icon: Icon, accent }) {
  return (
    <div className={`border ${accent ? "border-amber-200 bg-amber-50/40" : "border-neutral-200"} rounded-lg p-3`}>
      <div className="flex items-center justify-between text-neutral-500 text-[11px]">
        <span>{label}</span>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="mt-1 text-2xl font-bold text-neutral-900 fa-nums">{value}</div>
    </div>
  );
}
