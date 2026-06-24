import { useMemo, useState } from "react";
import { toJalaliShort } from "@/lib/jalali";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { evaluateRule, childrenOfTab, topLevelFields } from "@/lib/formLogic";
import JalaliDatePicker from "@/components/JalaliDatePicker";

/**
 * Renders a form (live) given its schema (list of FormField) and a `values` state.
 * Honours: visible_if rules + `tabs` field grouping (children show only for active tab).
 * Read-only when `readOnly` is true (used in builder preview).
 */
export default function FormRenderer({ fields, values, onChange, readOnly = false }) {
  const [activeTabs, setActiveTabs] = useState({}); // { [tabFieldId]: tabId }

  const ctx = useMemo(() => values || {}, [values]);

  const setValue = (id, v) => {
    if (readOnly) return;
    onChange?.({ ...(values || {}), [id]: v });
  };

  const renderField = (f) => {
    if (f.visible_if && !evaluateRule(f.visible_if, ctx)) return null;

    if (f.type === "heading") {
      return (
        <div key={f.id} className="pt-3">
          <h3 className="text-base font-semibold text-neutral-900">{f.label}</h3>
        </div>
      );
    }
    if (f.type === "divider") {
      return <div key={f.id} className="border-t border-dashed border-neutral-200 my-2" />;
    }

    if (f.type === "tabs") {
      const tabs = f.tab_options || [];
      const activeId = activeTabs[f.id] || tabs[0]?.id;
      const children = childrenOfTab(fields, f.id, activeId);
      return (
        <div key={f.id} className="space-y-3" data-testid={`render-tabs-${f.id}`}>
          <FieldLabel field={f} />
          <div className="inline-flex flex-wrap items-center gap-0 rounded-lg border border-neutral-300 overflow-hidden bg-white">
            {tabs.map((t, idx) => (
              <button
                key={t.id}
                type="button"
                disabled={readOnly}
                onClick={() => {
                  setActiveTabs((s) => ({ ...s, [f.id]: t.id }));
                  setValue(f.id, t.label);
                }}
                data-testid={`tab-${f.id}-${t.id}`}
                className={`px-4 py-2 text-xs transition-colors ${
                  activeId === t.id ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-50"
                } ${idx > 0 ? "border-s border-neutral-200" : ""}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {children.length > 0 && (
            <div className="space-y-3 ps-3 border-s-2 border-neutral-100 mt-3">
              {children.map(renderField)}
            </div>
          )}
        </div>
      );
    }

    return (
      <div key={f.id} className="space-y-1.5 animate-in" data-testid={`render-field-${f.id}`}>
        <FieldLabel field={f} />
        {(() => {
          switch (f.type) {
            case "text":
              return <Input value={ctx[f.id] || ""} onChange={(e) => setValue(f.id, e.target.value)} placeholder={f.placeholder} disabled={readOnly} />;
            case "number":
              return <Input type="number" inputMode="numeric" value={ctx[f.id] ?? ""} onChange={(e) => setValue(f.id, e.target.value)} placeholder={f.placeholder} disabled={readOnly} />;
            case "textarea":
              return <Textarea rows={3} value={ctx[f.id] || ""} onChange={(e) => setValue(f.id, e.target.value)} placeholder={f.placeholder} disabled={readOnly} />;
            case "date":
              return <JalaliDatePicker value={ctx[f.id] || ""} onChange={(v) => setValue(f.id, v)} disabled={readOnly} testId={`date-${f.id}`} />;
            case "select":
              return (
                <Select value={ctx[f.id] || ""} onValueChange={(v) => setValue(f.id, v)} disabled={readOnly}>
                  <SelectTrigger data-testid={`select-${f.id}`}><SelectValue placeholder="انتخاب کنید…" /></SelectTrigger>
                  <SelectContent>
                    {(f.options || []).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              );
            case "checkbox":
              return (
                <label className="flex items-center gap-2 text-sm text-neutral-700">
                  <Checkbox checked={!!ctx[f.id]} onCheckedChange={(v) => setValue(f.id, !!v)} disabled={readOnly} />
                  {f.placeholder || "بله"}
                </label>
              );
            case "user":
              return <Input value={ctx[f.id] || ""} onChange={(e) => setValue(f.id, e.target.value)} placeholder="@ کاربر" disabled={readOnly} />;
            case "file":
              return (
                <div className="border border-dashed border-neutral-300 rounded-md px-3 py-4 text-xs text-neutral-400 text-center bg-neutral-50/50">
                  فایل را اینجا رها کنید
                </div>
              );
            default:
              return null;
          }
        })()}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {topLevelFields(fields).map(renderField)}
    </div>
  );
}

function FieldLabel({ field }) {
  return (
    <div className="flex items-center gap-1 text-sm font-medium text-neutral-800">
      {field.label}
      {field.required && <span className="text-red-500">*</span>}
    </div>
  );
}
