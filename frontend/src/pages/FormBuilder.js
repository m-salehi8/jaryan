import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowRight, Save, Plus, Trash2, Type, AlignLeft, Hash, Calendar,
  ListChecks, CheckSquare, User, Paperclip, Heading2, Minus,
  Layers, ChevronUp, ChevronDown, Eye, EyeOff, Settings2, X, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import FormRenderer from "@/components/FormRenderer";
import { OP_LABELS } from "@/lib/formLogic";

const FIELD_TYPES = [
  { key: "text",     label: "متن کوتاه", icon: Type },
  { key: "textarea", label: "متن بلند",  icon: AlignLeft },
  { key: "number",   label: "عدد",       icon: Hash },
  { key: "date",     label: "تاریخ",     icon: Calendar },
  { key: "select",   label: "انتخابی",   icon: ListChecks },
  { key: "tabs",     label: "تب گروهی",  icon: Layers, accent: true },
  { key: "checkbox", label: "تیک",       icon: CheckSquare },
  { key: "user",     label: "کاربر",     icon: User },
  { key: "file",     label: "فایل",      icon: Paperclip },
  { key: "heading",  label: "تیتر",      icon: Heading2 },
  { key: "divider",  label: "جداکننده",  icon: Minus },
];

const uid = (p = "f") => `${p}_${Math.random().toString(36).slice(2, 10)}`;

const defaultField = (type) => {
  const meta = FIELD_TYPES.find(f => f.key === type);
  const base = {
    id: uid(),
    type,
    label: meta?.label || "فیلد",
    placeholder: "",
    required: false,
    options: [],
    tab_options: [],
    parent_tab_field_id: null,
    parent_tab_id: null,
    visible_if: null,
  };
  if (type === "select") base.options = ["گزینه ۱", "گزینه ۲"];
  if (type === "tabs") base.tab_options = [
    { id: uid("t"), label: "تب ۱" },
    { id: uid("t"), label: "تب ۲" },
  ];
  return base;
};

export default function FormBuilder() {
  const { id } = useParams();
  const nav = useNavigate();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [selectedFieldId, setSelectedFieldId] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [previewValues, setPreviewValues] = useState({});
  const [parentContext, setParentContext] = useState(null); // {tab_field_id, tab_id} when adding under a tab

  // load
  useEffect(() => {
    api.get(`/forms/${id}`).then(r => {
      // Backfill missing schema fields from older docs
      const normalized = (r.data.fields || []).map(f => ({
        options: [], tab_options: [], parent_tab_field_id: null, parent_tab_id: null,
        visible_if: null, ...f,
      }));
      setForm({ ...r.data, fields: normalized });
    }).catch(() => { toast.error("فرم یافت نشد"); nav("/admin/forms"); });
  }, [id, nav]);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/forms/${id}`, { name: form.name, description: form.description, fields: form.fields });
      toast.success("ذخیره شد");
    } finally { setSaving(false); }
  };

  const addField = (type, parent = null) => {
    const f = defaultField(type);
    if (parent) { f.parent_tab_field_id = parent.tab_field_id; f.parent_tab_id = parent.tab_id; }
    setForm({ ...form, fields: [...form.fields, f] });
    setSelectedFieldId(f.id);
  };
  const updateField = (fid, patch) => {
    setForm({ ...form, fields: form.fields.map(f => f.id === fid ? { ...f, ...patch } : f) });
  };
  const removeField = (fid) => {
    setForm({ ...form, fields: form.fields.filter(f => f.id !== fid && f.parent_tab_field_id !== fid) });
    setSelectedFieldId(null);
  };
  const moveField = (fid, dir) => {
    const list = [...form.fields];
    const idx = list.findIndex(f => f.id === fid);
    if (idx < 0) return;
    // Move within same scope (same parent tab + same tab_id)
    const target = list[idx];
    const same = (a) => a.parent_tab_field_id === target.parent_tab_field_id && a.parent_tab_id === target.parent_tab_id;
    const peers = list.map((f, i) => ({ f, i })).filter(({ f }) => same(f));
    const peerIdx = peers.findIndex(p => p.f.id === fid);
    const swapWith = peers[peerIdx + dir];
    if (!swapWith) return;
    [list[peers[peerIdx].i], list[swapWith.i]] = [list[swapWith.i], list[peers[peerIdx].i]];
    setForm({ ...form, fields: list });
  };

  // For inspector: list of candidate "controller" fields (above current field, top-level only)
  const eligibleControllers = (currentField) => {
    if (!form) return [];
    const idx = form.fields.findIndex(f => f.id === currentField.id);
    return form.fields
      .slice(0, idx)
      .filter(f => ["text", "number", "date", "select", "checkbox", "tabs"].includes(f.type));
  };

  const selectedField = form?.fields.find(f => f.id === selectedFieldId);

  if (!form) return <div className="p-10 text-sm text-muted-foreground">در حال بارگذاری…</div>;

  // Group top-level + per-tab structure for display
  const topFields = form.fields.filter(f => !f.parent_tab_field_id);

  return (
    <div className="min-h-screen pb-24" data-testid="formbuilder-root">
      {/* Topbar */}
      <div className="border-b border-border bg-card px-6 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/admin/forms" className="text-muted-foreground hover:text-foreground"><ArrowRight className="w-4 h-4" /></Link>
          <Input
            data-testid="form-name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="text-base font-semibold bg-transparent border-0 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button data-testid="toggle-preview" variant="outline" size="sm" onClick={() => setPreviewOpen(v => !v)}>
            {previewOpen ? <EyeOff className="w-4 h-4 me-1" /> : <Eye className="w-4 h-4 me-1" />}
            پیش‌نمایش زنده
          </Button>
          <Button data-testid="form-save" size="sm" onClick={save} disabled={saving} className="bg-brand hover:bg-brand-strong text-white font-semibold">
            <Save className="w-4 h-4 me-1" /> ذخیره
          </Button>
        </div>
      </div>

      <div className={`grid gap-6 p-6 lg:p-8 max-w-[1400px] mx-auto ${previewOpen ? "lg:grid-cols-[260px_1fr_380px]" : "lg:grid-cols-[260px_1fr]"}`}>
        {/* Palette */}
        <aside className="bg-card border border-border rounded-xl p-3 h-fit lg:sticky lg:top-20" data-testid="form-palette">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider px-1 mono mb-2">بلاک‌ها</div>
          <div className="grid grid-cols-2 gap-2">
            {FIELD_TYPES.map((t) => {
              const Icon = t.icon;
              return (
                <Button variant="ghost"
                  key={t.key}
                  data-testid={`palette-${t.key}`}
                  onClick={() => addField(t.key)}
                  className={`h-auto w-full flex flex-col items-center gap-1 px-2 py-3 rounded-lg border ${
                    t.accent ? "border-brand text-brand bg-brand-soft" : "border-border"
                  } hover:border-brand hover:bg-brand-soft hover:text-brand transition-colors text-xs whitespace-normal text-center`}
                >
                  <Icon className="w-4 h-4" />
                  {t.label}
                </Button>
              );
            })}
          </div>
        </aside>

        {/* Editor */}
        <div className="space-y-3">
          <div className="bg-card border border-border rounded-xl p-5">
            <Textarea
              rows={2}
              placeholder="توضیح کوتاه فرم…"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="border-0 focus-visible:ring-0 resize-none p-0 text-sm text-muted-foreground"
            />
          </div>

          {topFields.length === 0 && (
            <div className="border border-dashed border-border rounded-xl p-10 text-center text-sm text-muted-foreground">
              یک فیلد از سمت راست اضافه کن.
            </div>
          )}

          <ul className="space-y-2" data-testid="form-fields">
            {topFields.map(f => (
              <FieldCard
                key={f.id}
                field={f}
                allFields={form.fields}
                selected={selectedFieldId === f.id}
                onSelect={() => setSelectedFieldId(f.id)}
                onUpdate={(patch) => updateField(f.id, patch)}
                onMove={(dir) => moveField(f.id, dir)}
                onRemove={() => removeField(f.id)}
                onAddChild={(parentTabId, fieldType) => addField(fieldType, { tab_field_id: f.id, tab_id: parentTabId })}
                onSelectChild={(cid) => setSelectedFieldId(cid)}
                onUpdateChild={(cid, p) => updateField(cid, p)}
                onMoveChild={(cid, dir) => moveField(cid, dir)}
                onRemoveChild={(cid) => removeField(cid)}
                selectedFieldId={selectedFieldId}
              />
            ))}
          </ul>
        </div>

        {/* Preview */}
        {previewOpen && (
          <aside className="lg:sticky lg:top-20 h-fit" data-testid="form-preview">
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="border-b border-border px-4 py-2.5 flex items-center justify-between bg-muted">
                <div className="flex items-center gap-2 text-xs font-medium">
                  <Sparkles className="w-3.5 h-3.5" /> پیش‌نمایش زنده
                </div>
                <Button variant="ghost" size="sm" onClick={() => setPreviewValues({})} className="h-auto py-1 px-2 text-[11px] text-muted-foreground hover:text-foreground">
                  پاک‌سازی
                </Button>
              </div>
              <div className="p-5 max-h-[70vh] overflow-y-auto">
                {form.fields.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center py-8">پیش‌نمایش فرم اینجا نشان داده می‌شود.</div>
                ) : (
                  <FormRenderer fields={form.fields} values={previewValues} onChange={setPreviewValues} />
                )}
              </div>
              {Object.keys(previewValues).length > 0 && (
                <div className="border-t border-neutral-100 bg-muted/50 p-3">
                  <div className="text-[10px] text-muted-foreground mb-1.5 mono uppercase">payload</div>
                  <pre className="text-[10px] text-muted-foreground leading-relaxed whitespace-pre-wrap" dir="ltr">{JSON.stringify(previewValues, null, 2)}</pre>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Inspector Sheet (right) */}
      <Sheet open={!!selectedField} onOpenChange={(o) => !o && setSelectedFieldId(null)}>
        <SheetContent side="left" className="w-[420px] sm:max-w-[420px] p-0">
          {selectedField && (
            <Inspector
              field={selectedField}
              controllers={eligibleControllers(selectedField)}
              onChange={(patch) => updateField(selectedField.id, patch)}
              onClose={() => setSelectedFieldId(null)}
              onRemove={() => removeField(selectedField.id)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* ---------- Inspector ---------- */
function Inspector({ field, controllers, onChange, onClose, onRemove }) {
  const f = field;
  const rule = f.visible_if || null;

  return (
    <div className="h-full flex flex-col" data-testid="field-inspector">
      <SheetHeader className="px-5 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <SheetTitle className="text-sm font-semibold flex items-center gap-2">
            <Settings2 className="w-4 h-4" />
            تنظیمات فیلد — {f.label}
          </SheetTitle>
          <Button variant="ghost" size="icon" onClick={onClose} className="p-1.5 rounded-md hover:bg-muted"><X className="w-4 h-4" /></Button>
        </div>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <Section title="پایه">
          <Labeled label="عنوان">
            <Input data-testid="ins-label" value={f.label} onChange={(e) => onChange({ label: e.target.value })} />
          </Labeled>
          {!["heading", "divider", "tabs"].includes(f.type) && (
            <Labeled label="متن راهنما">
              <Input value={f.placeholder} onChange={(e) => onChange({ placeholder: e.target.value })} />
            </Labeled>
          )}
          {!["heading", "divider"].includes(f.type) && (
            <label className="flex items-center justify-between text-sm text-muted-foreground">
              <span>اجباری</span>
              <Switch data-testid="ins-required" checked={f.required} onCheckedChange={(v) => onChange({ required: v })} />
            </label>
          )}
        </Section>

        {f.type === "select" && (
          <Section title="گزینه‌ها">
            <OptionsEditor
              options={f.options || []}
              onChange={(opts) => onChange({ options: opts })}
            />
          </Section>
        )}

        {f.type === "tabs" && (
          <Section title="تب‌ها">
            <TabsEditor
              tabs={f.tab_options || []}
              onChange={(t) => onChange({ tab_options: t })}
            />
            <div className="text-[11px] text-muted-foreground mt-2 leading-5">
              برای هر تب از کارت فیلد در ویرایشگر، گزینه «+ افزودن فیلد به این تب» را بزنید.
            </div>
          </Section>
        )}

        {/* Validation rules */}
        {!["heading", "divider", "tabs", "checkbox", "file"].includes(f.type) && (
          <Section title="اعتبارسنجی (Validation)">
            <div className="space-y-3 p-3 bg-muted/50 border border-neutral-100 rounded-lg">
              {(f.type === "text" || f.type === "textarea") && (
                <div className="grid grid-cols-2 gap-2">
                  <Labeled label="حداقل طول">
                    <Input
                      type="number"
                      value={f.min_length || ""}
                      onChange={(e) => onChange({ min_length: e.target.value ? parseInt(e.target.value, 10) : null })}
                      className="text-xs bg-card"
                    />
                  </Labeled>
                  <Labeled label="حداکثر طول">
                    <Input
                      type="number"
                      value={f.max_length || ""}
                      onChange={(e) => onChange({ max_length: e.target.value ? parseInt(e.target.value, 10) : null })}
                      className="text-xs bg-card"
                    />
                  </Labeled>
                </div>
              )}
              {f.type === "number" && (
                <div className="grid grid-cols-2 gap-2">
                  <Labeled label="حداقل مقدار">
                    <Input
                      type="number"
                      value={f.min_value || ""}
                      onChange={(e) => onChange({ min_value: e.target.value ? parseFloat(e.target.value) : null })}
                      className="text-xs bg-card"
                    />
                  </Labeled>
                  <Labeled label="حداکثر مقدار">
                    <Input
                      type="number"
                      value={f.max_value || ""}
                      onChange={(e) => onChange({ max_value: e.target.value ? parseFloat(e.target.value) : null })}
                      className="text-xs bg-card"
                    />
                  </Labeled>
                </div>
              )}
              {["text", "textarea"].includes(f.type) && (
                <Labeled label="الگوی اعتبارسنجی (Regex)">
                  <Input
                    value={f.pattern || ""}
                    onChange={(e) => onChange({ pattern: e.target.value })}
                    placeholder="مثلاً: ^\d{10}$ برای کد ملی"
                    className="text-xs bg-card"
                    dir="ltr"
                  />
                </Labeled>
              )}
              <Labeled label="پیام خطای سفارشی">
                <Input
                  value={f.error_message || ""}
                  onChange={(e) => onChange({ error_message: e.target.value })}
                  placeholder="مثلاً: مقدار وارد شده نامعتبر است"
                  className="text-xs bg-card"
                />
              </Labeled>
            </div>
          </Section>
        )}

        {/* Visibility rule */}
        {!["heading", "divider"].includes(f.type) && (
          <Section title="منطق نمایش (Conditional Visibility)">
            <RuleEditor
              rule={rule}
              controllers={controllers}
              onChange={(r) => onChange({ visible_if: r })}
            />
          </Section>
        )}

        <Button variant="ghost"
          data-testid="ins-delete"
          onClick={onRemove}
          className="h-auto w-full mt-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 inline-flex items-center justify-center gap-2"
        >
          <Trash2 className="w-3.5 h-3.5" /> حذف فیلد
        </Button>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="space-y-3">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mono">{title}</div>
      {children}
    </div>
  );
}
function Labeled({ label, children }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

function OptionsEditor({ options, onChange }) {
  return (
    <div className="space-y-1.5">
      {options.map((o, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input value={o} onChange={(e) => { const n = [...options]; n[i] = e.target.value; onChange(n); }} />
          <Button variant="ghost" size="icon" onClick={() => onChange(options.filter((_, idx) => idx !== i))} className="h-8 w-8 flex-shrink-0 p-1.5 text-muted-foreground hover:text-red-600">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => onChange([...options, `گزینه ${options.length + 1}`])} className="w-full">
        <Plus className="w-3.5 h-3.5 me-1" /> افزودن گزینه
      </Button>
    </div>
  );
}

function TabsEditor({ tabs, onChange }) {
  return (
    <div className="space-y-1.5">
      {tabs.map((t, i) => (
        <div key={t.id} className="flex items-center gap-1.5" data-testid={`edit-tab-${t.id}`}>
          <span className="text-[10px] text-muted-foreground mono">#{i + 1}</span>
          <Input
            value={t.label}
            onChange={(e) => onChange(tabs.map(x => x.id === t.id ? { ...x, label: e.target.value } : x))}
          />
          <Button variant="ghost" size="icon" onClick={() => onChange(tabs.filter(x => x.id !== t.id))} className="h-8 w-8 flex-shrink-0 p-1.5 text-muted-foreground hover:text-red-600">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ))}
      <Button
        variant="outline" size="sm"
        onClick={() => onChange([...tabs, { id: `t_${Math.random().toString(36).slice(2,9)}`, label: `تب ${tabs.length + 1}` }])}
        className="w-full"
      >
        <Plus className="w-3.5 h-3.5 me-1" /> افزودن تب
      </Button>
    </div>
  );
}

function RuleEditor({ rule, controllers, onChange }) {
  // Normalize: rule is either null, or {field_id,op,value}, or {combinator,conditions}
  const isGroup = rule && rule.combinator && Array.isArray(rule.conditions);

  if (!rule) {
    return (
      <Button variant="ghost"
        data-testid="add-rule"
        onClick={() => onChange({ field_id: controllers[0]?.id || "", op: "=", value: "" })}
        disabled={controllers.length === 0}
        className="h-auto w-full text-sm py-2 px-3 border border-dashed border-border rounded-lg hover:border-brand hover:bg-brand-soft disabled:opacity-50 disabled:cursor-not-allowed text-muted-foreground hover:text-brand whitespace-normal transition-colors"
      >
        {controllers.length === 0 ? "ابتدا فیلدی بالاتر اضافه کن" : "+ افزودن قاعده شرطی"}
      </Button>
    );
  }

  // Promote single rule to a group if user wants to add another
  const promoteToGroup = () => onChange({
    combinator: "and",
    conditions: [rule, { field_id: controllers[0]?.id || "", op: "=", value: "" }],
  });

  if (!isGroup) {
    return (
      <div className="space-y-2">
        <ClauseEditor
          clause={rule}
          controllers={controllers}
          onChange={(c) => onChange(c)}
          onRemove={() => onChange(null)}
        />
        <Button variant="ghost"
          data-testid="add-and-clause"
          onClick={promoteToGroup}
          className="h-auto w-full text-xs py-1.5 rounded-md border border-dashed border-border hover:border-brand hover:text-brand text-muted-foreground whitespace-normal transition-colors"
        >
          + افزودن شرط ترکیبی (و / یا)
        </Button>
      </div>
    );
  }

  // Group rule
  return (
    <div className="bg-muted/60 border border-border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between mb-1">
        <div className="inline-flex rounded-md border border-border overflow-hidden">
          <Button variant="ghost"
            data-testid="combinator-and"
            onClick={() => onChange({ ...rule, combinator: "and" })}
            className={`h-auto rounded-none px-2.5 py-1 text-[11px] font-medium ${rule.combinator === "and" ? "bg-brand text-white" : "text-muted-foreground bg-card"}`}
          >و (همه)</Button>
          <Button variant="ghost"
            data-testid="combinator-or"
            onClick={() => onChange({ ...rule, combinator: "or" })}
            className={`h-auto rounded-none px-2.5 py-1 text-[11px] font-medium border-s border-border ${rule.combinator === "or" ? "bg-brand text-white" : "text-muted-foreground bg-card"}`}
          >یا (یکی)</Button>
        </div>
        <Button variant="ghost"
          data-testid="remove-rule"
          onClick={() => onChange(null)}
          className="h-auto py-1 px-2 text-[11px] text-muted-foreground hover:text-red-600"
        >پاک‌سازی همه</Button>
      </div>

      {rule.conditions.map((c, idx) => (
        <ClauseEditor
          key={idx}
          clause={c}
          controllers={controllers}
          onChange={(nc) => {
            const conds = [...rule.conditions]; conds[idx] = nc;
            onChange({ ...rule, conditions: conds });
          }}
          onRemove={() => {
            const conds = rule.conditions.filter((_, i) => i !== idx);
            if (conds.length <= 1) onChange(conds[0] || null);
            else onChange({ ...rule, conditions: conds });
          }}
          index={idx}
          combinator={rule.combinator}
        />
      ))}

      <Button variant="ghost"
        data-testid="add-another-clause"
        onClick={() => onChange({
          ...rule,
          conditions: [...rule.conditions, { field_id: controllers[0]?.id || "", op: "=", value: "" }],
        })}
        className="h-auto w-full text-xs py-1.5 rounded-md border border-dashed border-border hover:border-brand hover:text-brand text-muted-foreground whitespace-normal transition-colors"
      >
        + افزودن شرط دیگر
      </Button>
    </div>
  );
}

function ClauseEditor({ clause, controllers, onChange, onRemove, index, combinator }) {
  const ctl = controllers.find(c => c.id === clause.field_id);
  const opNeedsValue = !["empty", "not_empty"].includes(clause.op);

  return (
    <div className="bg-card border border-border rounded-md p-2.5 space-y-2 relative">
      {index !== undefined && index > 0 && (
        <div className="absolute -top-2.5 right-3 bg-card px-1.5 text-[9px] font-bold text-brand">
          {combinator === "or" ? "یا" : "و"}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-muted-foreground">وقتی…</div>
        <Button variant="ghost" size="icon" onClick={onRemove} className="h-6 w-6 flex-shrink-0 text-neutral-300 hover:text-red-600">
          <X className="w-3 h-3" />
        </Button>
      </div>
      <Select value={clause.field_id || ""} onValueChange={(v) => onChange({ ...clause, field_id: v })}>
        <SelectTrigger data-testid="rule-field" className="h-8 text-xs"><SelectValue placeholder="فیلد" /></SelectTrigger>
        <SelectContent>
          {controllers.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={clause.op || "="} onValueChange={(v) => onChange({ ...clause, op: v })}>
        <SelectTrigger data-testid="rule-op" className="h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {Object.entries(OP_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
        </SelectContent>
      </Select>
      {opNeedsValue && (
        (ctl?.type === "select" || ctl?.type === "tabs") ? (
          <Select value={clause.value || ""} onValueChange={(v) => onChange({ ...clause, value: v })}>
            <SelectTrigger data-testid="rule-value-select" className="h-8 text-xs"><SelectValue placeholder="مقدار" /></SelectTrigger>
            <SelectContent>
              {(ctl.type === "tabs" ? (ctl.tab_options || []).map(t => t.label) : (ctl.options || [])).map(o =>
                <SelectItem key={o} value={o}>{o}</SelectItem>
              )}
            </SelectContent>
          </Select>
        ) : (
          <Input data-testid="rule-value-input" className="h-8 text-xs" value={clause.value || ""} onChange={(e) => onChange({ ...clause, value: e.target.value })} placeholder="مقدار" />
        )
      )}
    </div>
  );
}

/* ---------- Field Card (in the editor) ---------- */
function FieldCard({
  field, allFields, selected, onSelect, onUpdate, onMove, onRemove,
  onAddChild, onSelectChild, onUpdateChild, onMoveChild, onRemoveChild, selectedFieldId,
}) {
  const f = field;
  const childGroups = useMemo(() => {
    if (f.type !== "tabs") return [];
    return (f.tab_options || []).map(t => ({
      tab: t,
      fields: allFields.filter(x => x.parent_tab_field_id === f.id && x.parent_tab_id === t.id),
    }));
  }, [f, allFields]);

  return (
    <li
      data-testid={`field-${f.id}`}
      className={`bg-card border rounded-xl transition-colors ${selected ? "border-neutral-900" : "border-border"}`}
    >
      <div className="p-3 flex items-start gap-2 group" onClick={onSelect}>
        <div className="flex flex-col items-center gap-0.5 text-neutral-300 pt-1">
          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onMove(-1); }} className="h-4 w-4 [&_svg]:size-3 hover:text-muted-foreground"><ChevronUp className="w-3 h-3" /></Button>
          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onMove(1); }} className="h-4 w-4 [&_svg]:size-3 hover:text-muted-foreground"><ChevronDown className="w-3 h-3" /></Button>
        </div>
        <div className="flex-1 min-w-0 space-y-1.5 cursor-pointer">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] mono uppercase px-1.5 py-0.5 rounded ${
              f.type === "tabs" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}>{f.type}</span>
            <Input
              data-testid={`field-${f.id}-label`}
              value={f.label}
              onChange={(e) => onUpdate({ label: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 bg-transparent border-0 focus:outline-none text-sm font-medium text-foreground"
            />
            {f.required && <span className="text-[10px] text-red-500">اجباری</span>}
            {f.visible_if && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">شرطی</span>
            )}
          </div>
          {/* Field mini preview */}
          {f.type !== "tabs" && f.type !== "heading" && f.type !== "divider" && (
            <div className="text-[11px] text-muted-foreground">{f.placeholder || "نمونه ورودی…"}</div>
          )}
        </div>
        <Button variant="ghost" size="icon"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          data-testid={`field-${f.id}-delete`}
          className="opacity-0 group-hover:opacity-100 transition p-1.5 text-red-500 hover:bg-red-50 rounded-md"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      {f.type === "tabs" && (
        <div className="border-t border-neutral-100 bg-muted/40">
          {childGroups.map((g) => (
            <div key={g.tab.id} className="p-3 border-b border-neutral-100 last:border-0">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                  <div className="text-xs font-medium text-foreground">تب «{g.tab.label}»</div>
                  <span className="text-[10px] text-muted-foreground fa-nums">({g.fields.length})</span>
                </div>
              </div>

              {g.fields.length === 0 && (
                <div className="text-[11px] text-muted-foreground px-2 py-1.5">برای این تب فیلدی اضافه نشده.</div>
              )}

              <ul className="space-y-1.5">
                {g.fields.map((cf) => (
                  <li
                    key={cf.id}
                    className={`bg-card border rounded-lg p-2 flex items-center gap-2 cursor-pointer ${selectedFieldId === cf.id ? "border-neutral-900" : "border-border"}`}
                    onClick={() => onSelectChild(cf.id)}
                    data-testid={`child-${cf.id}`}
                  >
                    <div className="flex flex-col items-center gap-0.5 text-neutral-300">
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onMoveChild(cf.id, -1); }} className="h-4 w-4 [&_svg]:size-3"><ChevronUp className="w-3 h-3 hover:text-muted-foreground" /></Button>
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onMoveChild(cf.id, 1); }} className="h-4 w-4 [&_svg]:size-3"><ChevronDown className="w-3 h-3 hover:text-muted-foreground" /></Button>
                    </div>
                    <span className="text-[10px] mono uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{cf.type}</span>
                    <Input
                      value={cf.label}
                      onChange={(e) => onUpdateChild(cf.id, { label: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 bg-transparent text-sm font-medium border-0 focus:outline-none"
                    />
                    {cf.visible_if && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">شرطی</span>}
                    <Button variant="ghost" size="icon"
                      onClick={(e) => { e.stopPropagation(); onRemoveChild(cf.id); }}
                      className="h-6 w-6 flex-shrink-0 [&_svg]:size-3 p-1 text-neutral-300 hover:text-red-600"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </li>
                ))}
              </ul>

              <ChildAdder onAdd={(t) => onAddChild(g.tab.id, t)} />
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

function ChildAdder({ onAdd }) {
  const [open, setOpen] = useState(false);
  const types = FIELD_TYPES.filter(t => t.key !== "tabs"); // no nested tabs for simplicity
  if (!open) {
    return (
      <Button variant="ghost"
        onClick={() => setOpen(true)}
        data-testid="add-child-field"
        className="h-auto mt-2 w-full text-xs py-1.5 rounded-md border border-dashed border-border hover:border-neutral-900 hover:bg-card text-muted-foreground whitespace-normal"
      >
        + افزودن فیلد به این تب
      </Button>
    );
  }
  return (
    <div className="mt-2 grid grid-cols-4 gap-1.5">
      {types.map(t => {
        const Icon = t.icon;
        return (
          <Button variant="ghost"
            key={t.key}
            onClick={() => { onAdd(t.key); setOpen(false); }}
            data-testid={`add-child-${t.key}`}
            className="h-auto w-full flex flex-col items-center gap-1 py-2 rounded-md border border-border hover:border-neutral-900 hover:bg-card text-[10px] text-muted-foreground whitespace-normal text-center"
          >
            <Icon className="w-3.5 h-3.5" />
            {t.label}
          </Button>
        );
      })}
      <Button variant="ghost" onClick={() => setOpen(false)} className="h-auto text-[10px] text-muted-foreground col-span-4 py-1">انصراف</Button>
    </div>
  );
}
