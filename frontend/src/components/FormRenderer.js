import { useMemo, useState, forwardRef, useImperativeHandle } from "react";
import { toJalaliShort } from "@/lib/jalali";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { evaluateRule, childrenOfTab, topLevelFields } from "@/lib/formLogic";
import JalaliDatePicker from "@/components/JalaliDatePicker";
import { useFormValidation } from "@/hooks/useFormValidation";

/**
 * Renders a form (live) given its schema (list of FormField) and a `values` state.
 * Honours: visible_if rules + `tabs` field grouping (children show only for active tab).
 * Read-only when `readOnly` is true (used in builder preview).
 */
const FormRenderer = forwardRef(({ fields, values, onChange, readOnly = false, fieldPermissions = {} }, ref) => {
  const [activeTabs, setActiveTabs] = useState({}); // { [tabFieldId]: tabId }

  const ctx = useMemo(() => values || {}, [values]);

  const { errors, touched, validateAll, markTouched } = useFormValidation(fields, ctx);

  useImperativeHandle(ref, () => ({
    validateAll
  }), [validateAll]);

  // Resolve effective disabled state per field: global readOnly OR per-field "readonly" permission
  const isFieldDisabled = (fieldId) => readOnly || fieldPermissions[fieldId] === "readonly";
  const isFieldHidden = (fieldId) => fieldPermissions[fieldId] === "hidden";

  const setValue = (id, v) => {
    if (readOnly || fieldPermissions[id] === "readonly") return;
    onChange?.({ ...(values || {}), [id]: v });
  };

  const renderField = (f) => {
    if (isFieldHidden(f.id)) return null;
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
            {tabs.map((t, idx) => {
              const hasErr = childrenOfTab(fields, f.id, t.id).some(child => touched[child.id] && errors[child.id]);
              return (
              <button
                key={t.id}
                type="button"
                disabled={readOnly}
                onClick={() => {
                  setActiveTabs((s) => ({ ...s, [f.id]: t.id }));
                  setValue(f.id, t.label);
                }}
                data-testid={`tab-${f.id}-${t.id}`}
                className={`px-4 py-2 text-xs transition-colors flex items-center gap-2 ${
                  activeId === t.id ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-50"
                } ${idx > 0 ? "border-s border-neutral-200" : ""}`}
              >
                {t.label}
                {hasErr && <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" title="دارای خطا" />}
              </button>
            )})}
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
              return <Input value={ctx[f.id] || ""} onChange={(e) => setValue(f.id, e.target.value)} onBlur={() => markTouched(f.id)} placeholder={f.placeholder} disabled={isFieldDisabled(f.id)} />;
            case "number":
              return <Input type="number" inputMode="numeric" value={ctx[f.id] ?? ""} onChange={(e) => setValue(f.id, e.target.value)} onBlur={() => markTouched(f.id)} placeholder={f.placeholder} disabled={isFieldDisabled(f.id)} />;
            case "textarea":
              return <Textarea rows={3} value={ctx[f.id] || ""} onChange={(e) => setValue(f.id, e.target.value)} onBlur={() => markTouched(f.id)} placeholder={f.placeholder} disabled={isFieldDisabled(f.id)} />;
            case "date":
              return <JalaliDatePicker value={ctx[f.id] || ""} onChange={(v) => { setValue(f.id, v); markTouched(f.id); }} disabled={isFieldDisabled(f.id)} testId={`date-${f.id}`} />;
            case "select":
              return (
                <Select value={ctx[f.id] || ""} onValueChange={(v) => { setValue(f.id, v); markTouched(f.id); }} disabled={isFieldDisabled(f.id)}>
                  <SelectTrigger data-testid={`select-${f.id}`}><SelectValue placeholder="انتخاب کنید…" /></SelectTrigger>
                  <SelectContent>
                    {(f.options || []).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              );
            case "checkbox":
              return (
                <label className="flex items-center gap-2 text-sm text-neutral-700">
                  <Checkbox checked={!!ctx[f.id]} onCheckedChange={(v) => { setValue(f.id, !!v); markTouched(f.id); }} disabled={isFieldDisabled(f.id)} />
                  {f.placeholder || "بله"}
                </label>
              );
            case "user":
              return <Input value={ctx[f.id] || ""} onChange={(e) => setValue(f.id, e.target.value)} onBlur={() => markTouched(f.id)} placeholder="@ کاربر" disabled={isFieldDisabled(f.id)} />;
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
        {touched[f.id] && errors[f.id] && (
          <div className="text-[11px] text-red-500 font-medium mt-1 animate-in slide-in-from-top-1">
            {errors[f.id]}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {topLevelFields(fields).map(renderField)}
    </div>
  );
});

export default FormRenderer;

function FieldLabel({ field }) {
  return (
    <div className="flex items-center gap-1 text-sm font-medium text-neutral-800">
      {field.label}
      {field.required && <span className="text-red-500">*</span>}
    </div>
  );
}
