import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Loader2, Sparkles } from "lucide-react";
import {
  Calendar, Banknote, ShoppingCart, UserPlus, Monitor,
  Plane, Star, FileSignature, Workflow,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { toFaNumber } from "@/lib/jalali";
import { TEMPLATES } from "@/lib/templates";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const TEMPLATES_LIST = TEMPLATES;

const ICONS = {
  Calendar, Banknote, ShoppingCart, UserPlus, Monitor,
  Plane, Star, FileSignature, Workflow,
};

const NODE_TYPE_LABEL = {
  trigger: "شروع",
  task: "وظیفه",
  approval: "تایید",
  condition: "شرط",
  form: "فرم",
  end: "پایان",
};

export default function TemplateLibraryModal({ open, onClose }) {
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const nav = useNavigate();

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return TEMPLATES_LIST;
    return TEMPLATES_LIST.filter(
      (t) =>
        t.name.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const selected = TEMPLATES_LIST.find((t) => t.id === selectedId) || null;

  const useTemplate = async () => {
    if (!selected) return;
    setCreating(true);
    try {
      const payload = {
        name: selected.name,
        description: selected.description,
        nodes: selected.nodes,
        edges: selected.edges,
      };
      const r = await api.post("/workflows", payload);
      toast.success("فرایند از تمپلیت ایجاد شد");
      onClose();
      nav(`/admin/workflows/${r.data.id}`);
    } catch {
      toast.error("خطا در ایجاد فرایند. دوباره تلاش کنید.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setSelectedId(null);
          setQ("");
        }
        onClose();
      }}
    >
      <DialogContent
        dir="rtl"
        className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col"
        data-testid="template-modal"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-brand" />
            کتابخانه تمپلیت‌ها
          </DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="flex items-center gap-2 border border-neutral-200 rounded-lg px-3 bg-white">
          <Search className="w-4 h-4 text-neutral-400" />
          <input
            data-testid="template-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجوی تمپلیت…"
            className="flex-1 bg-transparent text-sm py-2 focus:outline-none"
          />
        </div>

        <div className="flex-1 min-h-0 overflow-hidden grid md:grid-cols-2 gap-4">
          {/* Grid of cards */}
          <div className="overflow-y-auto pe-1">
            {filtered.length === 0 ? (
              <div className="text-sm text-neutral-400 py-10 text-center">
                تمپلیتی یافت نشد
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {filtered.map((t) => {
                  const Icon = ICONS[t.icon] || Workflow;
                  const isActive = selectedId === t.id;
                  return (
                    <button
                      key={t.id}
                      data-testid={`template-card-${t.id}`}
                      onClick={() => setSelectedId(t.id)}
                      className={`text-right rounded-xl border p-3 transition-all ${
                        isActive
                          ? "border-brand bg-brand-soft ring-1 ring-brand"
                          : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="w-7 h-7 rounded-md bg-neutral-100 grid place-items-center shrink-0">
                          <Icon className="w-4 h-4 text-neutral-700" />
                        </div>
                        <div className="text-sm font-semibold text-neutral-900 truncate">{t.name}</div>
                      </div>
                      <div className="text-[11px] text-neutral-500 leading-5 line-clamp-2">{t.description}</div>
                      <div className="text-[10px] text-neutral-400 mt-1.5 fa-nums">
                        {toFaNumber(t.nodes.length)} گره
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Preview panel */}
          <div className="border border-neutral-200 rounded-xl bg-neutral-50 p-4 overflow-y-auto">
            {!selected ? (
              <div className="h-full grid place-items-center text-sm text-neutral-400 text-center px-4">
                یک تمپلیت را برای پیش‌نمایش انتخاب کنید.
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-1">
                  {(() => {
                    const Icon = ICONS[selected.icon] || Workflow;
                    return (
                      <div className="w-8 h-8 rounded-md bg-white border border-neutral-200 grid place-items-center">
                        <Icon className="w-4 h-4 text-neutral-700" />
                      </div>
                    );
                  })()}
                  <div className="text-sm font-bold text-neutral-900">{selected.name}</div>
                </div>
                <p className="text-[11px] text-neutral-500 mb-4">{selected.description}</p>

                <div className="text-[11px] text-neutral-500 mb-2">گره‌های فرایند</div>
                <ol className="relative ms-2 border-s border-neutral-200 ps-4 space-y-2 mb-4">
                  {selected.nodes.map((n) => (
                    <li key={n.id} className="relative">
                      <span className="absolute -start-[19px] top-1 w-2.5 h-2.5 rounded-full bg-white border-2 border-neutral-300" />
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-neutral-200 text-neutral-600">
                          {NODE_TYPE_LABEL[n.type] || n.type}
                        </span>
                        <span className="text-sm text-neutral-900">{n.label}</span>
                        {n.data?.assignee_role && (
                          <span className="text-[10px] text-neutral-400">— {n.data.assignee_role}</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>

                <div className="text-[11px] text-neutral-500 mb-4">
                  تعداد اتصال‌ها: <span className="fa-nums">{toFaNumber(selected.edges.length)}</span>
                </div>

                <button
                  data-testid="use-template-btn"
                  onClick={useTemplate}
                  disabled={creating}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-brand hover:bg-brand-strong disabled:opacity-60 text-white text-sm font-semibold transition-all"
                >
                  {creating ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> در حال ایجاد…</>
                  ) : (
                    <><Sparkles className="w-4 h-4" /> استفاده از این تمپلیت</>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
