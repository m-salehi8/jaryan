import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserPlus, Trash2, Users, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";

const ROLES = ["ادمین سازمان", "طراح فرایند", "مدیر تیم", "کارمند"];

const ROLE_BADGE = {
  "ادمین سازمان": "bg-brand-soft text-brand border-brand/20",
  "طراح فرایند": "bg-blue-50 text-blue-700 border-blue-200",
  "مدیر تیم": "bg-amber-50 text-amber-700 border-amber-200",
  "کارمند": "bg-neutral-100 text-neutral-600 border-neutral-200",
};

const emptyForm = { full_name: "", email: "", role: "کارمند", password: "" };

export default function UserManagement() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null); // user object
  const [deleting, setDeleting] = useState(false);
  const [roleDrafts, setRoleDrafts] = useState({}); // { [id]: role } for optimistic UI

  // Admin guard
  useEffect(() => {
    if (user && user.role !== "ادمین سازمان") {
      nav("/", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const load = () => {
    setLoading(true);
    api.get("/users").then((r) => setUsers(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => {
    if (user?.role === "ادمین سازمان") load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const addUser = async () => {
    setFormError("");
    if (!form.full_name.trim() || !form.email.trim() || !form.password.trim()) {
      setFormError("لطفاً همه فیلدها را پر کنید.");
      return;
    }
    if (form.password.length < 6) {
      setFormError("رمز عبور باید حداقل ۶ کاراکتر باشد.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/users", {
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        role: form.role,
        password: form.password,
      });
      toast.success("کاربر افزوده شد");
      setForm(emptyForm);
      setAddOpen(false);
      load();
    } catch (e) {
      if (e?.response?.status === 409) {
        setFormError("این ایمیل قبلاً ثبت شده است");
      } else {
        setFormError("خطا در افزودن کاربر. دوباره تلاش کنید.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const changeRole = async (uid, newRole, prevRole) => {
    if (uid === user.id) {
      toast.error("نمی‌توانید نقش خودتان را تغییر دهید");
      // rollback draft
      setRoleDrafts((d) => ({ ...d, [uid]: prevRole }));
      return;
    }
    // optimistic update
    setUsers((list) => list.map((u) => (u.id === uid ? { ...u, role: newRole } : u)));
    try {
      await api.patch(`/users/${uid}`, { role: newRole });
      toast.success("نقش کاربر به‌روز شد");
      setRoleDrafts((d) => ({ ...d, [uid]: undefined }));
    } catch {
      toast.error("خطا در به‌روزرسانی نقش");
      // rollback
      setUsers((list) => list.map((u) => (u.id === uid ? { ...u, role: prevRole } : u)));
      setRoleDrafts((d) => ({ ...d, [uid]: prevRole }));
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.id === user.id) {
      toast.error("امکان حذف حساب خودتان وجود ندارد");
      setDeleteTarget(null);
      return;
    }
    setDeleting(true);
    try {
      await api.delete(`/users/${deleteTarget.id}`);
      toast.success("کاربر حذف شد");
      setUsers((list) => list.filter((u) => u.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      toast.error("خطا در حذف کاربر");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-6 lg:p-10 max-w-[1100px] mx-auto" data-testid="users-root">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <div className="text-xs text-neutral-400">مدیریت سازمان</div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <Users className="w-5 h-5" /> مدیریت کاربران
          </h1>
          <p className="text-sm text-neutral-500 mt-1">کاربران سازمان را اضافه، ویرایش یا حذف کنید.</p>
        </div>
        <Button
          data-testid="add-user-btn"
          onClick={() => { setForm(emptyForm); setFormError(""); setAddOpen(true); }}
          className="bg-brand hover:bg-brand-strong text-white font-semibold shadow-[0_4px_14px_rgba(79,70,229,0.25)]"
        >
          <UserPlus className="w-4 h-4 me-2" /> افزودن کاربر
        </Button>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-neutral-400">در حال بارگذاری…</div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-sm text-neutral-400">هیچ کاربری یافت نشد.</div>
        ) : (
          <ul>
            {users.map((u) => {
              const draftRole = roleDrafts[u.id];
              const currentRole = draftRole !== undefined ? draftRole : u.role;
              return (
                <li
                  key={u.id}
                  data-testid={`user-row-${u.id}`}
                  className="flex items-center gap-3 px-4 py-3 border-b border-neutral-100 last:border-0"
                >
                  <div
                    className="w-9 h-9 rounded-full grid place-items-center text-white text-sm font-medium shrink-0"
                    style={{ background: u.avatar_color || "#737373" }}
                  >
                    {u.full_name?.[0] || "؟"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-neutral-900 truncate">
                      {u.full_name}
                      {u.id === user.id && <span className="text-[10px] text-neutral-400 ms-2">(شما)</span>}
                    </div>
                    <div className="text-[11px] text-neutral-500 truncate">{u.email}</div>
                  </div>

                  {/* Role badge + edit */}
                  <span className={`hidden sm:inline-block text-[10px] px-1.5 py-0.5 rounded-md border ${ROLE_BADGE[u.role] || ROLE_BADGE["کارمند"]}`}>
                    {u.role}
                  </span>

                  <div className="w-[150px]" data-testid={`edit-role-${u.id}`}>
                    <Select
                      value={currentRole}
                      onValueChange={(v) => changeRole(u.id, v, u.role)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => (
                          <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <button
                    data-testid={`delete-user-${u.id}`}
                    onClick={() => {
                      if (u.id === user.id) {
                        toast.error("امکان حذف حساب خودتان وجود ندارد");
                        return;
                      }
                      setDeleteTarget(u);
                    }}
                    className="p-1.5 rounded-md text-red-500 hover:bg-red-50 transition-colors shrink-0"
                    title="حذف کاربر"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Add user modal */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>افزودن کاربر جدید</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-sm">نام کامل</Label>
              <Input
                data-testid="add-user-name"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                placeholder="مثلاً: علی رضایی"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">ایمیل</Label>
              <Input
                type="email"
                data-testid="add-user-email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="user@example.com"
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">نقش</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm({ ...form, role: v })}
              >
                <SelectTrigger data-testid="add-user-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">رمز عبور اولیه</Label>
              <Input
                type="password"
                data-testid="add-user-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="حداقل ۶ کاراکتر"
                dir="ltr"
              />
            </div>
            {formError && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">
                {formError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>انصراف</Button>
            <Button
              data-testid="add-user-confirm"
              onClick={addUser}
              disabled={submitting}
              className="bg-brand hover:bg-brand-strong text-white"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "افزودن"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              حذف کاربر
            </AlertDialogTitle>
            <AlertDialogDescription>
              آیا از حذف {deleteTarget?.full_name} اطمینان دارید؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirm-delete-user"
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
