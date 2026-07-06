import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, FileText, Search } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { fromNow, toFaNumber } from "@/lib/jalali";

export default function FormsList() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const nav = useNavigate();

  const load = () => api.get("/forms").then(r => setRows(r.data));
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!name.trim()) return;
    const r = await api.post("/forms", { name, description: "", fields: [] });
    toast.success("فرم ایجاد شد");
    setOpen(false); setName("");
    nav(`/admin/forms/${r.data.id}`);
  };

  const filtered = rows.filter(r => r.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="p-6 lg:p-10 max-w-[1400px] mx-auto" data-testid="forms-root">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <div className="text-xs text-neutral-400">فرم‌ها</div>
          <h1 className="text-2xl font-bold text-neutral-900">فرم‌ساز</h1>
          <p className="text-sm text-neutral-500 mt-1">فرم‌های بلاک‌محور سبک نوشن برای فرایندهای سازمانی.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="new-form-btn" className="bg-brand hover:bg-brand-strong text-white font-semibold shadow-[0_4px_14px_rgba(79,70,229,0.25)]">
              <Plus className="w-4 h-4 me-2" /> فرم جدید
            </Button>
          </DialogTrigger>
          <DialogContent dir="rtl">
            <DialogHeader><DialogTitle>فرم جدید</DialogTitle></DialogHeader>
            <Input data-testid="new-form-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="نام فرم" autoFocus />
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>انصراف</Button>
              <Button data-testid="create-form-confirm" onClick={create} className="bg-neutral-900 text-white">ایجاد</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-200">
          <Search className="w-4 h-4 text-neutral-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی فرم…" className="flex-1 bg-transparent text-sm focus:outline-none" />
          <span className="text-[11px] text-neutral-400 fa-nums">{filtered.length} مورد</span>
        </div>

        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-8 h-8 text-neutral-300 mx-auto mb-3" />
            <div className="text-sm text-neutral-500">فرمی موجود نیست.</div>
          </div>
        ) : (
          <ul>
            {filtered.map((f) => (
              <li key={f.id} className="row-hover border-b border-neutral-100 last:border-0" data-testid={`form-row-${f.id}`}>
                <Link to={`/admin/forms/${f.id}`} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-md bg-neutral-100 grid place-items-center">
                    <FileText className="w-4 h-4 text-neutral-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-neutral-900 truncate">{f.name}</div>
                    <div className="text-[11px] text-neutral-500 truncate">{f.description || "بدون توضیح"}</div>
                  </div>
                  <span className="text-[11px] text-neutral-400 fa-nums">{toFaNumber(f.fields?.length || 0)} فیلد</span>
                  <span className="text-[11px] text-neutral-400 hidden md:block fa-nums">{fromNow(f.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
