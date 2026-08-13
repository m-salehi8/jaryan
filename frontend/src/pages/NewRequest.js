import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Play, Loader2, FileText, Workflow, Search } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export default function NewRequest() {
  const nav = useNavigate();
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startingId, setStartingId] = useState(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    api
      .get("/workflows")
      .then((r) => setWorkflows((r.data || []).filter((w) => w.status === "published")))
      .catch(() => toast.error("خطا در دریافت فرایندها"))
      .finally(() => setLoading(false));
  }, []);

  const start = async (wf) => {
    setStartingId(wf.id);
    try {
      await api.post(`/workflows/${wf.id}/start`);
      toast.success(`درخواست «${wf.name}» آغاز شد`);
      nav("/inbox");
    } catch (e) {
      const detail = e?.response?.data?.detail;
      toast.error(detail === "workflow_not_published" ? "این فرایند هنوز منتشر نشده است" : "خطا در شروع فرایند");
    } finally {
      setStartingId(null);
    }
  };

  const filtered = workflows.filter(
    (w) =>
      q === "" ||
      w.name?.toLowerCase().includes(q.toLowerCase()) ||
      (w.description || "").toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="p-6 lg:p-10 max-w-[1100px] mx-auto" data-testid="new-request-root">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
        <div>
          <div className="text-xs text-muted-foreground mb-1">درخواست جدید</div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">یک درخواست تازه ثبت کنید</h1>
          <p className="text-sm text-muted-foreground mt-1">
            فرایند موردنظر را انتخاب کنید تا شروع شود؛ اولین گام آن مستقیم در کارتابل شما قرار می‌گیرد.
          </p>
        </div>
        <div className="flex items-center gap-2 border border-border rounded-lg px-3 bg-card">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input
            data-testid="new-request-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجوی فرایند…"
            className="text-sm bg-transparent border-0 py-2 focus:outline-none w-48"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-border rounded-2xl bg-card" data-testid="new-request-empty">
          <Workflow className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <div className="text-sm text-muted-foreground">
            {workflows.length === 0
              ? "هنوز فرایند منتشرشده‌ای وجود ندارد. لطفاً با مدیر سازمان هماهنگ کنید."
              : "فرایندی با این عنوان یافت نشد."}
          </div>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((wf) => (
            <div
              key={wf.id}
              data-testid={`workflow-card-${wf.id}`}
              className="group flex flex-col bg-card border border-border rounded-2xl p-5 hover:border-brand hover:shadow-[0_8px_30px_rgba(79,70,229,0.10)] transition-all"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand grid place-items-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-foreground leading-tight">{wf.name}</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-6 flex-1 min-h-[48px]">
                {wf.description || "بدون توضیحات."}
              </p>
              <Button
                data-testid={`start-workflow-${wf.id}`}
                onClick={() => start(wf)}
                disabled={startingId === wf.id}
                className="mt-4 w-full bg-brand hover:bg-brand-strong text-white font-semibold"
              >
                {startingId === wf.id ? (
                  <><Loader2 className="w-4 h-4 me-1 animate-spin" /> در حال شروع…</>
                ) : (
                  <><Play className="w-4 h-4 me-1" /> شروع درخواست</>
                )}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
