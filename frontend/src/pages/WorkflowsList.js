import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Workflow, Search, Play, MoreHorizontal, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { fromNow } from "@/lib/jalali";
import TemplateLibraryModal from "@/components/TemplateLibraryModal";

const STATUS_LABEL = { draft: "پیش‌نویس", published: "منتشر شده", archived: "بایگانی" };

export default function WorkflowsList() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [templateOpen, setTemplateOpen] = useState(false);
  const nav = useNavigate();

  const load = () => {
    setLoading(true);
    api.get("/workflows").then(r => setRows(r.data)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const create = async () => {
    if (!name.trim()) return;
    const r = await api.post("/workflows", {
      name,
      description: "",
      nodes: [
        { id: "n1", type: "trigger", label: "شروع", position: { x: 80, y: 160 }, data: {} },
        { id: "n2", type: "end", label: "پایان", position: { x: 360, y: 160 }, data: {} },
      ],
      edges: [{ id: "e1", source: "n1", target: "n2" }],
    });
    toast.success("فرایند ایجاد شد");
    setOpen(false);
    setName("");
    nav(`/admin/workflows/${r.data.id}`);
  };

  const start = async (id, status) => {
    if (status !== "published") {
      toast.error("ابتدا فرایند را منتشر کنید");
      return;
    }
    try {
      await api.post(`/workflows/${id}/start`);
      toast.success("نمونه فرایند آغاز شد");
    } catch (e) {
      const msg = e?.response?.data?.detail === "workflow_not_published" ? "فرایند منتشر نشده است" : "خطا در اجرا";
      toast.error(msg);
    }
  };

  const filtered = rows.filter(r => r.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="p-6 lg:p-10 max-w-[1400px] mx-auto" data-testid="workflows-root">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <div className="text-xs text-neutral-400">فرایندها</div>
          <h1 className="text-2xl font-bold text-neutral-900">طراحی فرایند</h1>
          <p className="text-sm text-neutral-500 mt-1">فرایندهای سازمانت را روی بوم بصری بساز و منتشر کن.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            data-testid="from-template-btn"
            variant="outline"
            onClick={() => setTemplateOpen(true)}
            className="font-semibold"
          >
            <Sparkles className="w-4 h-4 me-2" /> از تمپلیت شروع کن
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="new-workflow-btn" className="bg-brand hover:bg-brand-strong text-white font-semibold shadow-[0_4px_14px_rgba(79,70,229,0.25)]">
              <Plus className="w-4 h-4 me-2" /> فرایند جدید
            </Button>
          </DialogTrigger>
          <DialogContent dir="rtl">
            <DialogHeader><DialogTitle>فرایند جدید</DialogTitle></DialogHeader>
            <div className="space-y-2 py-2">
              <label className="text-sm">نام فرایند</label>
              <Input
                data-testid="new-workflow-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثلاً: درخواست تجهیزات IT"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>انصراف</Button>
              <Button data-testid="create-workflow-confirm" onClick={create} className="bg-neutral-900 text-white">ایجاد</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <TemplateLibraryModal open={templateOpen} onClose={() => setTemplateOpen(false)} />

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-200">
          <Search className="w-4 h-4 text-neutral-400" />
          <input
            data-testid="search-workflows"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجوی فرایند…"
            className="flex-1 bg-transparent text-sm focus:outline-none"
          />
          <span className="text-[11px] text-neutral-400 fa-nums">{filtered.length} مورد</span>
        </div>

        {loading ? (
          <div className="p-4 space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="w-8 h-8 rounded-md shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="w-16 h-5 rounded-md" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Workflow className="w-8 h-8 text-neutral-300 mx-auto mb-3" />
            <div className="text-sm text-neutral-500">هنوز فرایندی نداری.</div>
          </div>
        ) : (
          <ul>
            {filtered.map((w) => (
              <li key={w.id} data-testid={`workflow-row-${w.id}`} className="row-hover border-b border-neutral-100 last:border-0">
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-md bg-neutral-100 grid place-items-center">
                    <Workflow className="w-4 h-4 text-neutral-700" />
                  </div>
                  <Link to={`/admin/workflows/${w.id}`} className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-neutral-900 truncate">{w.name}</div>
                    <div className="text-[11px] text-neutral-500 truncate">{w.description || "بدون توضیح"}</div>
                  </Link>
                  <span className={`text-[10px] px-2 py-0.5 rounded-md font-semibold ${
                    w.status === "published"
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                      : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                  }`}>{STATUS_LABEL[w.status]}</span>
                  <span className="text-[11px] text-neutral-400 hidden md:block fa-nums">{fromNow(w.created_at)}</span>
                  <button
                    data-testid={`start-${w.id}`}
                    onClick={() => start(w.id, w.status)}
                    disabled={w.status !== "published"}
                    className="p-1.5 rounded-md hover:bg-brand-soft text-brand disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    title={w.status === "published" ? "اجرا" : "ابتدا منتشر کنید"}
                  >
                    <Play className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
