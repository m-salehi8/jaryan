import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Clock, ChevronLeft, LogOut, Inbox } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toJalaliShort, fromNow } from "@/lib/jalali";

const STATUS_LABEL = {
  pending: "در انتظار", in_progress: "در حال انجام",
  approved: "تایید شده", rejected: "رد شده", done: "انجام شده",
};

export default function MobileApprovals() {
  const { user, logout } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [active, setActive] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get("/tasks?assigned_to_me=true&status=pending").then(r => setTasks(r.data)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const act = async (id, status) => {
    await api.patch(`/tasks/${id}`, { status });
    toast.success(status === "approved" ? "تایید شد" : status === "rejected" ? "رد شد" : "انجام شد");
    setTasks((ts) => ts.filter(t => t.id !== id));
    setActive(null);
  };

  return (
    <div className="min-h-screen bg-neutral-50 max-w-md mx-auto" data-testid="mobile-root">
      <header className="bg-white border-b border-neutral-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-neutral-900 text-white grid place-items-center text-sm font-bold">ج</div>
          <div>
            <div className="text-sm font-semibold">جریان</div>
            <div className="text-[10px] text-neutral-400">تاییدهای سریع</div>
          </div>
        </div>
        <button onClick={() => { logout(); window.location.href = "/login"; }} className="p-2 text-neutral-500">
          <LogOut className="w-4 h-4" />
        </button>
      </header>

      <div className="p-4">
        <div className="mb-4 text-xs text-neutral-500">
          سلام <span className="font-medium text-neutral-900">{user?.full_name}</span> — {tasks.length === 0 ? "همه چیز مرتب است." : `${tasks.length} تسک منتظر شماست.`}
        </div>

        {loading && <div className="text-center text-sm text-neutral-400 py-12">در حال بارگذاری…</div>}

        {!loading && tasks.length === 0 && (
          <div className="border border-dashed border-neutral-300 rounded-xl p-10 text-center" data-testid="mobile-empty">
            <Inbox className="w-8 h-8 text-neutral-300 mx-auto mb-3" />
            <div className="text-sm text-neutral-500">هیچ تسکی در انتظار نیست.</div>
          </div>
        )}

        <ul className="space-y-2">
          {tasks.map(t => (
            <li key={t.id} className="bg-white rounded-xl border border-neutral-200 p-4 active:scale-[0.99] transition" data-testid={`m-task-${t.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-neutral-400 mb-1">{t.workflow_name}</div>
                  <div className="text-sm font-semibold text-neutral-900">{t.title}</div>
                  {t.description && <div className="text-xs text-neutral-500 mt-1.5 leading-6 line-clamp-2">{t.description}</div>}
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-neutral-500">
                    {t.deadline && (<span className="fa-nums flex items-center gap-1"><Clock className="w-3 h-3" /> {toJalaliShort(t.deadline)}</span>)}
                    <span>{STATUS_LABEL[t.status]}</span>
                  </div>
                </div>
                <button onClick={() => setActive(t)} className="p-2 text-neutral-400" data-testid={`m-detail-${t.id}`}>
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
              <div className="flex gap-2 mt-3">
                {t.type === "approval" ? (
                  <>
                    <button data-testid={`m-approve-${t.id}`} onClick={() => act(t.id, "approved")} className="flex-1 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" /> تایید
                    </button>
                    <button data-testid={`m-reject-${t.id}`} onClick={() => act(t.id, "rejected")} className="flex-1 py-2.5 rounded-lg border border-red-200 text-red-600 text-sm font-medium flex items-center justify-center gap-1.5">
                      <XCircle className="w-4 h-4" /> رد
                    </button>
                  </>
                ) : (
                  <button data-testid={`m-done-${t.id}`} onClick={() => act(t.id, "done")} className="flex-1 py-2.5 rounded-lg bg-neutral-900 text-white text-sm font-medium flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> پایان تسک
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {active && (
        <div className="fixed inset-0 bg-black/40 z-20 flex items-end" onClick={() => setActive(null)}>
          <div className="bg-white w-full rounded-t-2xl p-5 animate-in" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-neutral-200 rounded-full mx-auto mb-4" />
            <div className="text-[10px] text-neutral-400">{active.workflow_name}</div>
            <h3 className="text-base font-semibold mt-1">{active.title}</h3>
            {active.description && <p className="text-sm text-neutral-600 mt-2 leading-7">{active.description}</p>}
            <div className="flex items-center gap-3 mt-3 text-[11px] text-neutral-500">
              {active.deadline && <span className="fa-nums">مهلت: {toJalaliShort(active.deadline)}</span>}
              {active.assignee_role && <span>نقش: {active.assignee_role}</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
