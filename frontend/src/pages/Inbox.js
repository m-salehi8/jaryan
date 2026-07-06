import { useEffect, useMemo, useState } from "react";
import { Search, Filter, CheckCircle2, XCircle, Clock, Inbox as InboxIcon, ArrowLeft, FileText } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toJalaliDateTime, toJalaliShort, fromNow, toFaNumber } from "@/lib/jalali";
import FormRenderer from "@/components/FormRenderer";
import { getSLAStatus, SLA_BADGE } from "@/lib/sla";

const FILTERS = [
  { key: "all", label: "همه" },
  { key: "pending", label: "در انتظار" },
  { key: "in_progress", label: "در حال انجام" },
  { key: "approved", label: "تایید شده" },
  { key: "rejected", label: "رد شده" },
  { key: "done", label: "انجام شده" },
];

const STATUS_META = {
  pending:     { label: "در انتظار",   cls: "bg-amber-50 text-amber-700 border-amber-100" },
  in_progress: { label: "در حال انجام", cls: "bg-blue-50 text-blue-700 border-blue-100" },
  approved:    { label: "تایید شده",   cls: "bg-emerald-50 text-emerald-700 border-emerald-100" },
  rejected:    { label: "رد شده",      cls: "bg-red-50 text-red-700 border-red-100" },
  done:        { label: "انجام شده",   cls: "bg-neutral-100 text-neutral-600 border-neutral-200" },
};

const PRIORITY_DOT = {
  urgent: "bg-red-500", high: "bg-amber-500", medium: "bg-neutral-400", low: "bg-neutral-300",
};

export default function Inbox() {
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [activeId, setActiveId] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [assignedToMe, setAssignedToMe] = useState(true);
  const [formSchema, setFormSchema] = useState(null);
  const [formValues, setFormValues] = useState({});

  const load = () => {
    setLoading(true);
    const q = assignedToMe ? "?assigned_to_me=true" : "";
    api.get(`/tasks${q}`).then(r => {
      setTasks(r.data);
      if (r.data.length && !activeId) setActiveId(r.data[0].id);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [assignedToMe]);

  useEffect(() => {
    if (!activeId) { setComments([]); return; }
    api.get(`/comments?target_type=task&target_id=${activeId}`).then(r => setComments(r.data));
  }, [activeId]);

  // Load form schema for task detail when applicable
  useEffect(() => {
    const t = tasks.find(x => x.id === activeId);
    if (!t || !t.form_id) { setFormSchema(null); setFormValues({}); return; }
    api.get(`/forms/${t.form_id}`).then(r => {
      setFormSchema(r.data);
      setFormValues(t.form_data || {});
    }).catch(() => setFormSchema(null));
  }, [activeId, tasks]);

  const filtered = useMemo(() => {
    return tasks.filter(t => (filter === "all" || t.status === filter) &&
      (q === "" || t.title.toLowerCase().includes(q.toLowerCase()) || t.workflow_name.toLowerCase().includes(q.toLowerCase())));
  }, [tasks, filter, q]);

  const active = tasks.find(t => t.id === activeId);

  const updateStatus = async (status) => {
    if (!active) return;
    const body = { status };
    if (formSchema && active.type === "form") body.form_data = formValues;
    await api.patch(`/tasks/${active.id}`, body);
    toast.success("به‌روزرسانی انجام شد");
    // Refresh task list so the new tasks created by the engine appear
    load();
  };

  const addComment = async () => {
    if (!newComment.trim() || !active) return;
    const r = await api.post("/comments", { target_type: "task", target_id: active.id, body: newComment });
    setComments((c) => [...c, r.data]);
    setNewComment("");
  };

  return (
    <div className="h-[calc(100vh-56px)] md:h-screen flex flex-col" data-testid="inbox-root" data-tour-id="tour-inbox-root">
      <div className="border-b border-neutral-200 bg-white px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <InboxIcon className="w-4 h-4" />
          <h1 className="text-base font-semibold">کارتابل تسک‌ها</h1>
          <span className="text-xs text-neutral-400 fa-nums">({toFaNumber(filtered.length)})</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            data-testid="toggle-mine"
            onClick={() => setAssignedToMe(v => !v)}
            className={`text-xs px-2.5 py-1 rounded-md border ${assignedToMe ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-200 text-neutral-600"}`}
          >
            {assignedToMe ? "تسک‌های من" : "همه تسک‌ها"}
          </button>
          <div className="flex items-center gap-2 border border-neutral-200 rounded-md px-2 bg-white">
            <Search className="w-3.5 h-3.5 text-neutral-400" />
            <input
              data-testid="inbox-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="جستجو…"
              className="text-xs bg-transparent py-1.5 focus:outline-none w-40"
            />
          </div>
        </div>
      </div>

      {/* Filter strip */}
      <div className="border-b border-neutral-200 bg-white px-6 py-2 flex items-center gap-1 overflow-x-auto">
        <Filter className="w-3.5 h-3.5 text-neutral-400 ms-2 shrink-0" />
        {FILTERS.map((f) => (
          <button
            key={f.key}
            data-testid={`filter-${f.key}`}
            onClick={() => setFilter(f.key)}
            className={`text-xs px-2.5 py-1 rounded-md shrink-0 ${
              filter === f.key ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex-1 flex min-h-0">
        {/* List */}
        <div className="w-full md:w-[420px] border-l border-neutral-200 bg-white overflow-y-auto">
          {loading ? (
            <div className="p-10 text-sm text-neutral-400 text-center">در حال بارگذاری…</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-sm text-neutral-400 text-center">تسکی یافت نشد.</div>
          ) : (
            <ul>
              {filtered.map((t) => {
                const s = STATUS_META[t.status] || STATUS_META.pending;
                return (
                  <li
                    key={t.id}
                    data-testid={`task-row-${t.id}`}
                    onClick={() => setActiveId(t.id)}
                    className={`cursor-pointer border-b border-neutral-100 px-4 py-3 ${
                      activeId === t.id ? "bg-neutral-100" : "hover:bg-neutral-50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[t.priority]}`} />
                      <div className="text-sm font-medium text-neutral-900 truncate flex-1">{t.title}</div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md border ${s.cls}`}>{s.label}</span>
                      {(() => { const sla = getSLAStatus(t.deadline, t.status); return sla ? <span data-testid={`sla-${sla}-${t.id}`} className={`text-[10px] px-1.5 py-0.5 rounded-md ${SLA_BADGE[sla].cls}`}>{SLA_BADGE[sla].label}</span> : null; })()}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 text-[11px] text-neutral-500">
                      <span className="truncate">{t.workflow_name}</span>
                      {t.deadline && (
                        <>
                          <span className="text-neutral-300">•</span>
                          <span className="fa-nums flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {toJalaliShort(t.deadline)}
                          </span>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Detail */}
        <div className="hidden md:flex flex-1 min-w-0 bg-[#fafafa]">
          {!active ? (
            <div className="flex-1 grid place-items-center text-sm text-neutral-400">یک تسک از فهرست انتخاب کن.</div>
          ) : (
            <div className="flex-1 overflow-auto p-8 max-w-3xl">
              <div className="text-[11px] text-neutral-400 mb-1">{active.workflow_name}</div>
              <h2 className="text-2xl font-bold text-neutral-900">{active.title}</h2>
              <div className="flex items-center gap-3 mt-2 text-xs text-neutral-500">
                <span className={`px-1.5 py-0.5 rounded-md border ${STATUS_META[active.status].cls}`}>{STATUS_META[active.status].label}</span>
                <span>اولویت: {active.priority === "urgent" ? "فوری" : active.priority === "high" ? "بالا" : active.priority === "medium" ? "متوسط" : "پایین"}</span>
                {active.assignee_role && <span>نقش: {active.assignee_role}</span>}
                {active.deadline && <span className="fa-nums">مهلت: {toJalaliDateTime(active.deadline)}</span>}
              </div>

              {active.description && (
                <div className="mt-5 bg-white border border-neutral-200 rounded-xl p-4 text-sm leading-7 text-neutral-700">
                  {active.description}
                </div>
              )}

              {active.type === "approval" && active.status === "pending" && (
                <div className="mt-5 flex gap-2">
                  <Button data-testid="approve-btn" onClick={() => updateStatus("approved")} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    <CheckCircle2 className="w-4 h-4 me-1" /> تایید
                  </Button>
                  <Button data-testid="reject-btn" variant="outline" onClick={() => updateStatus("rejected")} className="text-red-600 border-red-200 hover:bg-red-50">
                    <XCircle className="w-4 h-4 me-1" /> رد
                  </Button>
                </div>
              )}
              {active.type !== "approval" && active.status !== "done" && (
                <div className="mt-5">
                  <Button data-testid="done-btn" onClick={() => updateStatus("done")} className="bg-neutral-900 text-white">
                    <CheckCircle2 className="w-4 h-4 me-1" /> پایان تسک
                  </Button>
                </div>
              )}

              {/* Comments */}
              <div className="mt-8">
                <div className="text-xs text-neutral-500 mb-3">گفتگو</div>
                <ul className="space-y-3">
                  {comments.map((c) => (
                    <li key={c.id} className="bg-white border border-neutral-200 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium">{c.author_name}</span>
                        <span className="text-[10px] text-neutral-400">{fromNow(c.created_at)}</span>
                      </div>
                      <div className="text-sm text-neutral-700 leading-6">{c.body}</div>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex items-start gap-2">
                  <Textarea data-testid="comment-input" rows={2} value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="یک کامنت بنویس…" />
                  <Button data-testid="comment-send" onClick={addComment} className="bg-neutral-900 text-white">
                    ارسال <ArrowLeft className="w-3.5 h-3.5 ms-1" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
