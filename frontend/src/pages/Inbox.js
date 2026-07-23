import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Search, Filter, CheckCircle2, XCircle, Clock, Inbox as InboxIcon, ArrowLeft, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toJalaliDateTime, toJalaliShort, fromNow, toFaNumber } from "@/lib/jalali";
import FormRenderer from "@/components/FormRenderer";
import { getSLAStatus, SLA_BADGE } from "@/lib/sla";
import ErrorBoundary from "@/components/ErrorBoundary";
import { evaluateRule } from "@/lib/formLogic";

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
  done:        { label: "انجام شده",   cls: "bg-muted text-muted-foreground border-border" },
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
  const [saveStatus, setSaveStatus] = useState(""); // "Saving...", "Saved", ""

  // Mentions state
  const [users, setUsers] = useState([]);
  const [mentionQuery, setMentionQuery] = useState(null);
  const [mentions, setMentions] = useState([]);
  const textareaRef = useRef(null);
  const formRef = useRef(null);
  const [processingId, setProcessingId] = useState(null);

  const load = useCallback((background = false) => {
    if (!background) setLoading(true);
    const q = assignedToMe ? "?assigned_to_me=true" : "";
    api.get(`/tasks${q}`).then(r => {
      setTasks(r.data);
      setActiveId(prev => (r.data.length && !prev) ? r.data[0].id : prev);
    }).finally(() => {
      if (!background) setLoading(false);
    });
  }, [assignedToMe]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get("/users").then(r => setUsers(r.data)).catch(() => {});
  }, []);

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
      setFormValues((t.draft_data && Object.keys(t.draft_data).length > 0) ? t.draft_data : (t.form_data || {}));
    }).catch(() => setFormSchema(null));
  }, [activeId, tasks]);

  const active = tasks.find(t => t.id === activeId);

  // Auto-save debounce effect
  useEffect(() => {
    if (!active || active.type !== "form" || active.status !== "pending") return;
    const timeout = setTimeout(() => {
      setSaveStatus("در حال ذخیره...");
      api.post(`/tasks/${active.id}/draft`, { draft_data: formValues })
        .then(() => setSaveStatus("ذخیره شد"))
        .catch(() => setSaveStatus("خطا در ذخیره"));
    }, 3000);
    return () => clearTimeout(timeout);
  }, [formValues, active]);

  const filtered = useMemo(() => {
    return tasks.filter(t => (filter === "all" || t.status === filter) &&
      (q === "" || t.title.toLowerCase().includes(q.toLowerCase()) || t.workflow_name.toLowerCase().includes(q.toLowerCase())));
  }, [tasks, filter, q]);

  const updateStatus = async (status) => {
    if (!active) return;
    const activeTask = active;
    
    const body = { status };
    if (formSchema && activeTask.type === "form") {
      if (status === "done" && formRef.current) {
        const isValid = formRef.current.validateAll();
        if (!isValid) {
          toast.error("لطفا فیلدهای فرم را به درستی تکمیل کنید");
          return;
        }
      }
      
      const cleanData = {};
      formSchema.fields.forEach(f => {
        if (!f.visible_if || evaluateRule(f.visible_if, formValues)) {
          if (formValues[f.id] !== undefined) {
            cleanData[f.id] = formValues[f.id];
          }
        }
      });
      body.form_data = cleanData;
    }

    const previousTasks = [...tasks];
    
    // Optimistic UI Update
    setTasks(prev => prev.map(t => t.id === activeTask.id ? { ...t, status: "processing" } : t));
    setProcessingId(activeTask.id);

    try {
      await api.patch(`/tasks/${activeTask.id}`, body);
      toast.success("به‌روزرسانی انجام شد");
      setTasks(prev => prev.filter(t => t.id !== activeTask.id));
      if (activeId === activeTask.id) {
        setActiveId(null);
      }
      load(true); // reload in background
    } catch (e) {
      setTasks(previousTasks);
      toast.error("خطا در به‌روزرسانی تسک. لطفا دوباره تلاش کنید.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleCommentChange = (e) => {
    const val = e.target.value;
    setNewComment(val);
    
    // Find the last word if it starts with @
    const cursor = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursor);
    const lastWordMatch = textBeforeCursor.match(/@(\S*)$/);
    if (lastWordMatch) {
      setMentionQuery(lastWordMatch[1]);
    } else {
      setMentionQuery(null);
    }
  };

  const selectMention = (user) => {
    const cursor = textareaRef.current?.selectionStart || 0;
    const textBeforeCursor = newComment.slice(0, cursor);
    const textAfterCursor = newComment.slice(cursor);
    const textBeforeMention = textBeforeCursor.replace(/@\S*$/, "");
    
    setNewComment(textBeforeMention + "@" + user.full_name + " " + textAfterCursor);
    if (!mentions.includes(user.id)) {
      setMentions([...mentions, user.id]);
    }
    setMentionQuery(null);
    textareaRef.current?.focus();
  };

  const addComment = async () => {
    if (!newComment.trim() || !active) return;
    const r = await api.post("/comments", { 
      target_type: "task", 
      target_id: active.id, 
      body: newComment,
      mentions: mentions
    });
    setComments((c) => [...c, r.data]);
    setNewComment("");
    setMentions([]);
  };

  const filteredUsers = mentionQuery !== null 
    ? users.filter(u => u.full_name.toLowerCase().includes(mentionQuery.toLowerCase())) 
    : [];

  return (
    <div className="h-[calc(100vh-56px)] md:h-screen flex flex-col" data-testid="inbox-root" data-tour-id="tour-inbox-root">
      <div className="border-b border-border bg-card px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <InboxIcon className="w-4 h-4" />
          <h1 className="text-base font-semibold">کارتابل تسک‌ها</h1>
          <span className="text-xs text-muted-foreground fa-nums">({toFaNumber(filtered.length)})</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            data-testid="toggle-mine"
            onClick={() => setAssignedToMe(v => !v)}
            className={`text-xs px-2.5 py-1 rounded-md border ${assignedToMe ? "bg-primary text-primary-foreground border-neutral-900" : "bg-card border-border text-muted-foreground"}`}
          >
            {assignedToMe ? "تسک‌های من" : "همه تسک‌ها"}
          </button>
          <div className="flex items-center gap-2 border border-border rounded-md px-2 bg-card">
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
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
      <div className="border-b border-border bg-card px-6 py-2 flex items-center gap-1 overflow-x-auto">
        <Filter className="w-3.5 h-3.5 text-muted-foreground ms-2 shrink-0" />
        {FILTERS.map((f) => (
          <button
            key={f.key}
            data-testid={`filter-${f.key}`}
            onClick={() => setFilter(f.key)}
            className={`text-xs px-2.5 py-1 rounded-md shrink-0 ${
              filter === f.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex-1 flex min-h-0">
        <ErrorBoundary>
        {/* List */}
        <div className="w-full md:w-[420px] border-l border-border bg-card overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-2 p-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="w-1.5 h-1.5 rounded-full shrink-0" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="w-12 h-4 rounded-md" />
                  </div>
                  <Skeleton className="w-32 h-3" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-sm text-muted-foreground text-center">تسکی یافت نشد.</div>
          ) : (
            <ul>
              {filtered.map((t) => {
                const s = STATUS_META[t.status] || STATUS_META.pending;
                return (
                  <li
                    key={t.id}
                    data-testid={`task-row-${t.id}`}
                    onClick={() => processingId !== t.id && setActiveId(t.id)}
                    className={`cursor-pointer border-b border-neutral-100 px-4 py-3 ${
                      activeId === t.id ? "bg-muted" : "hover:bg-muted"
                    } ${processingId === t.id ? "opacity-60 pointer-events-none" : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[t.priority]}`} />
                      <div className="text-sm font-medium text-foreground truncate flex-1">{t.title}</div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md border ${s.cls}`}>{s.label}</span>
                      {(() => { const sla = getSLAStatus(t.deadline, t.status); return sla ? <span data-testid={`sla-${sla}-${t.id}`} className={`text-[10px] px-1.5 py-0.5 rounded-md ${SLA_BADGE[sla].cls}`}>{SLA_BADGE[sla].label}</span> : null; })()}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
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
        <div className="hidden md:flex flex-1 min-w-0 bg-[#fafafa] dark:bg-background">
          {!active ? (
            <div className="flex-1 grid place-items-center text-sm text-muted-foreground">یک تسک از فهرست انتخاب کن.</div>
          ) : (
            <div className="flex-1 overflow-auto p-8 max-w-3xl">
              <div className="text-[11px] text-muted-foreground mb-1">{active.workflow_name}</div>
              <h2 className="text-2xl font-bold text-foreground">{active.title}</h2>
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <span className={`px-1.5 py-0.5 rounded-md border ${STATUS_META[active.status].cls}`}>{STATUS_META[active.status].label}</span>
                <span>اولویت: {active.priority === "urgent" ? "فوری" : active.priority === "high" ? "بالا" : active.priority === "medium" ? "متوسط" : "پایین"}</span>
                {active.assignee_role && <span>نقش: {active.assignee_role}</span>}
                {active.deadline && <span className="fa-nums">مهلت: {toJalaliDateTime(active.deadline)}</span>}
              </div>

              {active.description && (
                <div className="mt-5 bg-card border border-border rounded-xl p-4 text-sm leading-7 text-muted-foreground">
                  {active.description}
                </div>
              )}

              {/* Form Rendering */}
              {active.type === "form" && formSchema && (
                <div className="mt-6 border border-border bg-card rounded-xl p-6 relative">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-foreground">تکمیل فرم</h3>
                    {saveStatus && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        {saveStatus === "در حال ذخیره..." && <Loader2 className="w-3 h-3 animate-spin" />}
                        {saveStatus}
                      </span>
                    )}
                  </div>
                  <FormRenderer 
                    ref={formRef}
                    fields={formSchema.fields} 
                    values={formValues} 
                    onChange={setFormValues} 
                    readOnly={active.status === "done" || active.status === "approved" || active.status === "rejected"}
                    fieldPermissions={active.field_permissions || {}}
                  />
                </div>
              )}

              {active.type === "approval" && active.status === "pending" && (
                <div className="mt-5 flex gap-2">
                  <Button data-testid="approve-btn" disabled={processingId === active.id} onClick={() => updateStatus("approved")} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    {processingId === active.id ? <Loader2 className="w-4 h-4 me-1 animate-spin" /> : <CheckCircle2 className="w-4 h-4 me-1" />} تایید
                  </Button>
                  <Button data-testid="reject-btn" disabled={processingId === active.id} variant="outline" onClick={() => updateStatus("rejected")} className="text-red-600 border-red-200 hover:bg-red-50">
                    {processingId === active.id ? <Loader2 className="w-4 h-4 me-1 animate-spin" /> : <XCircle className="w-4 h-4 me-1" />} رد
                  </Button>
                </div>
              )}
              {active.type !== "approval" && active.status !== "done" && (
                <div className="mt-5">
                  <Button data-testid="done-btn" disabled={processingId === active.id} onClick={() => updateStatus("done")} className="bg-primary text-primary-foreground">
                    {processingId === active.id ? <Loader2 className="w-4 h-4 me-1 animate-spin" /> : <CheckCircle2 className="w-4 h-4 me-1" />} پایان تسک
                  </Button>
                </div>
              )}

              {/* Comments */}
              <div className="mt-8">
                <div className="text-xs text-muted-foreground mb-3">گفتگو</div>
                <ul className="space-y-3">
                  {comments.map((c) => (
                    <li key={c.id} className="bg-card border border-border rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium">{c.author_name}</span>
                        <span className="text-[10px] text-muted-foreground">{fromNow(c.created_at)}</span>
                      </div>
                      <div className="text-sm text-muted-foreground leading-6 whitespace-pre-wrap">
                        {/* Highlight mentions in comment body */}
                        {c.body.split(/(@\S+)/).map((word, i) => 
                          word.startsWith('@') ? <span key={i} className="text-blue-600 font-medium">{word}</span> : word
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex items-start gap-2 relative">
                  <div className="flex-1 relative">
                    <Textarea 
                      data-testid="comment-input" 
                      ref={textareaRef}
                      rows={2} 
                      value={newComment} 
                      onChange={handleCommentChange} 
                      placeholder="یک کامنت بنویس… (با @ دیگران را منشن کن)" 
                    />
                    
                    {/* Mentions Dropdown */}
                    {mentionQuery !== null && (
                      <div className="absolute z-10 bottom-full mb-1 left-0 w-64 bg-card border border-border shadow-xl rounded-lg overflow-hidden">
                        {filteredUsers.length === 0 ? (
                          <div className="text-xs text-muted-foreground p-3 text-center">کاربری یافت نشد</div>
                        ) : (
                          <ul className="max-h-48 overflow-y-auto py-1">
                            {filteredUsers.map(u => (
                              <li 
                                key={u.id}
                                className="px-3 py-2 text-sm text-muted-foreground hover:bg-muted cursor-pointer flex items-center gap-2"
                                onClick={() => selectMention(u)}
                              >
                                <span className="w-5 h-5 rounded-full bg-neutral-200 flex items-center justify-center text-[10px] shrink-0">
                                  {u.full_name[0]}
                               </span>
                                <span className="truncate">{u.full_name}</span>
                                <span className="text-[10px] text-muted-foreground shrink-0">{u.role}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>

                  <Button data-testid="comment-send" onClick={addComment} className="bg-primary text-primary-foreground shrink-0">
                    ارسال <ArrowLeft className="w-3.5 h-3.5 ms-1" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
        </ErrorBoundary>
      </div>
    </div>
  );
}
