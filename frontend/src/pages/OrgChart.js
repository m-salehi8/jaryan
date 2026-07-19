import { useState, useEffect } from "react";
import { Users, Plus, Edit2, Trash2, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function OrgChart() {
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState(null);

  // Form
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [managerId, setManagerId] = useState("");

  const fetchData = async () => {
    try {
      const [dRes, uRes] = await Promise.all([
        api.get("/departments"),
        api.get("/users")
      ]);
      setDepartments(dRes.data);
      setUsers(uRes.data);
    } catch {
      toast.error("خطا در دریافت اطلاعات سازمان");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openAdd = () => {
    setEditingDept(null);
    setName("");
    setParentId("");
    setManagerId("");
    setModalOpen(true);
  };

  const openEdit = (d) => {
    setEditingDept(d);
    setName(d.name);
    setParentId(d.parent_id || "");
    setManagerId(d.manager_id || "");
    setModalOpen(true);
  };

  const remove = async (id) => {
    if (!window.confirm("آیا از حذف این دپارتمان مطمئن هستید؟")) return;
    try {
      await api.delete(`/departments/${id}`);
      toast.success("دپارتمان حذف شد");
      fetchData();
    } catch {
      toast.error("خطا در حذف دپارتمان");
    }
  };

  const save = async () => {
    if (!name.trim()) return toast.error("نام دپارتمان الزامی است");
    try {
      const payload = {
        name,
        parent_id: parentId || null,
        manager_id: managerId || null,
      };
      if (editingDept) {
        await api.patch(`/departments/${editingDept.id}`, payload);
        toast.success("دپارتمان بروزرسانی شد");
      } else {
        await api.post("/departments", payload);
        toast.success("دپارتمان ایجاد شد");
      }
      setModalOpen(false);
      fetchData();
    } catch {
      toast.error("خطا در ذخیره دپارتمان");
    }
  };

  // Build tree
  const roots = departments.filter(d => !d.parent_id);
  const getChildren = (pid) => departments.filter(d => d.parent_id === pid);

  if (loading) return <div className="p-10 text-neutral-400 text-sm">در حال بارگذاری...</div>;

  return (
    <div className="p-6 lg:p-10 max-w-[1200px] mx-auto animate-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2 tracking-tight">
            <Users className="w-6 h-6 text-brand" />
            ساختار سازمانی
          </h1>
          <p className="text-sm text-neutral-500 mt-2">
            مدیریت دپارتمان‌ها و سلسله مراتب سازمانی
          </p>
        </div>
        <Button onClick={openAdd} className="bg-brand hover:bg-brand-strong text-white font-semibold">
          <Plus className="w-4 h-4 me-2" /> افزودن دپارتمان
        </Button>
      </div>

      <div className="bg-neutral-50/50 border border-neutral-200 rounded-xl p-6 min-h-[400px]">
        {roots.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-20">
            <div className="w-16 h-16 bg-white border border-neutral-200 rounded-2xl grid place-items-center mb-4 shadow-sm">
              <Users className="w-8 h-8 text-neutral-400" />
            </div>
            <div className="text-neutral-900 font-medium mb-1">ساختار سازمانی خالی است</div>
            <div className="text-neutral-500 text-sm max-w-sm">هنوز هیچ دپارتمانی ایجاد نکرده‌اید. برای شروع، دپارتمان اصلی سازمان را بسازید.</div>
          </div>
        ) : (
          <div className="flex flex-col">
            {roots.map(r => renderNode(r, 0, getChildren, users, openEdit, remove))}
          </div>
        )}
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent dir="rtl" className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingDept ? "ویرایش دپارتمان" : "افزودن دپارتمان جدید"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-neutral-700">نام دپارتمان</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="مثلا: منابع انسانی" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-neutral-700">دپارتمان والد (اختیاری)</label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger><SelectValue placeholder="انتخاب دپارتمان والد" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">بدون والد (دپارتمان اصلی)</SelectItem>
                  {departments.filter(d => d.id !== editingDept?.id).map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-neutral-700">مدیر دپارتمان (اختیاری)</label>
              <Select value={managerId} onValueChange={setManagerId}>
                <SelectTrigger><SelectValue placeholder="انتخاب مدیر" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">بدون مدیر</SelectItem>
                  {users.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-neutral-100">
            <Button variant="outline" onClick={() => setModalOpen(false)}>انصراف</Button>
            <Button onClick={save} className="bg-brand hover:bg-brand-strong text-white">{editingDept ? "ذخیره تغییرات" : "ایجاد دپارتمان"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const renderNode = (dept, depth, getChildren, users, openEdit, remove) => {
  const children = getChildren(dept.id);
  const manager = users.find(u => u.id === dept.manager_id);
  
  return (
    <div key={dept.id} className="flex flex-col relative">
      <div 
        className="flex items-center justify-between bg-white border border-neutral-200 p-4 rounded-lg shadow-sm w-full max-w-2xl mb-3 relative z-10 hover:border-brand-soft transition-colors"
        style={{ marginRight: depth * 24 }}
      >
        {/* connector line */}
        {depth > 0 && (
          <div className="absolute -right-[25px] top-1/2 w-[24px] h-[1px] bg-neutral-300" />
        )}

        <div>
          <div className="font-semibold text-neutral-900">{dept.name}</div>
          <div className="text-xs text-neutral-500 mt-1 flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5" /> 
            مدیر: {manager ? manager.full_name : <span className="text-neutral-300">تعیین نشده</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => openEdit(dept)} className="p-1.5 text-neutral-400 hover:text-brand hover:bg-brand-soft rounded-md transition-colors"><Edit2 className="w-4 h-4" /></button>
          <button onClick={() => remove(dept.id)} className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>
      
      {children.length > 0 && (
        <div className="relative flex flex-col">
          <div 
            className="absolute right-0 top-0 bottom-6 w-[1px] bg-neutral-300"
            style={{ marginRight: (depth * 24) + 24 }}
          />
          {children.map(c => renderNode(c, depth + 1, getChildren, users, openEdit, remove))}
        </div>
      )}
    </div>
  );
};
