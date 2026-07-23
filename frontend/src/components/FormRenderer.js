import React, { useMemo, useState, forwardRef, useImperativeHandle, useCallback, useRef } from "react";
import { toJalaliShort } from "@/lib/jalali";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { evaluateRule, childrenOfTab, topLevelFields } from "@/lib/formLogic";
import JalaliDatePicker from "@/components/JalaliDatePicker";
import { useFormValidation } from "@/hooks/useFormValidation";

const MemoizedField = React.memo(({ field, value, onChange, onBlur, disabled, hasError }) => {
  const errClass = hasError ? "border-red-500 focus-visible:ring-red-500 bg-red-50/10" : "";
  switch (field.type) {
    case "text":
      return <Input value={value || ""} onChange={(e) => onChange(field.id, e.target.value)} onBlur={() => onBlur(field.id)} placeholder={field.placeholder} disabled={disabled} className={errClass} />;
    case "number":
      return <Input type="number" inputMode="numeric" value={value ?? ""} onChange={(e) => onChange(field.id, e.target.value)} onBlur={() => onBlur(field.id)} placeholder={field.placeholder} disabled={disabled} className={errClass} />;
    case "textarea":
      return <Textarea rows={3} value={value || ""} onChange={(e) => onChange(field.id, e.target.value)} onBlur={() => onBlur(field.id)} placeholder={field.placeholder} disabled={disabled} className={errClass} />;
    case "date":
      return <div className={hasError ? "rounded-md border border-red-500 shadow-sm" : ""}><JalaliDatePicker value={value || ""} onChange={(v) => onChange(field.id, v)} disabled={disabled} testId={`date-${field.id}`} /></div>;
    case "select":
      return (
        <Select value={value || ""} onValueChange={(v) => onChange(field.id, v)} disabled={disabled}>
          <SelectTrigger data-testid={`select-${field.id}`} className={errClass}><SelectValue placeholder="انتخاب کنید…" /></SelectTrigger>
          <SelectContent>
            {(field.options || []).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    case "checkbox":
      return (
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={!!value} onCheckedChange={(v) => onChange(field.id, !!v)} disabled={disabled} className={hasError ? "border-red-500" : ""} />
          {field.placeholder || "بله"}
        </label>
      );
    case "user":
      return <Input value={value || ""} onChange={(e) => onChange(field.id, e.target.value)} onBlur={() => onBlur(field.id)} placeholder="@ کاربر" disabled={disabled} className={errClass} />;
    case "file":
      return (
        <div className={`border border-dashed rounded-md px-3 py-4 text-xs text-center ${hasError ? 'border-red-500 text-red-600 bg-red-50/50' : 'border-border text-muted-foreground bg-muted/50'}`}>
          فایل را اینجا رها کنید
        </div>
      );
    default:
      return null;
  }
});

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

  // Stable callbacks using ref to avoid re-renders when `values` change
  const valuesRef = useRef(values);
  valuesRef.current = values;

  const handleChange = useCallback((id, v) => {
    if (readOnly || fieldPermissions[id] === "readonly") return;
    onChange?.({ ...(valuesRef.current || {}), [id]: v });
    markTouched(id);
  }, [readOnly, fieldPermissions, onChange, markTouched]);

  const handleBlur = useCallback((id) => {
    markTouched(id);
  }, [markTouched]);

  const renderField = (f) => {
    if (isFieldHidden(f.id)) return null;
    if (f.visible_if && !evaluateRule(f.visible_if, ctx)) return null;

    if (f.type === "heading") {
      return (
        <div key={f.id} className="pt-3">
          <h3 className="text-base font-semibold text-foreground">{f.label}</h3>
        </div>
      );
    }
    if (f.type === "divider") {
      return <div key={f.id} className="border-t border-dashed border-border my-2" />;
    }

    if (f.type === "tabs") {
      const tabs = f.tab_options || [];
      const activeId = activeTabs[f.id] || tabs[0]?.id;
      const children = childrenOfTab(fields, f.id, activeId);
      return (
        <div key={f.id} className="space-y-3" data-testid={`render-tabs-${f.id}`}>
          <FieldLabel field={f} />
          <div className="inline-flex flex-wrap items-center gap-0 rounded-lg border border-border overflow-hidden bg-card">
            {tabs.map((t, idx) => {
              const hasErr = childrenOfTab(fields, f.id, t.id).some(child => touched[child.id] && errors[child.id]);
              return (
              <button
                key={t.id}
                type="button"
                disabled={readOnly}
                onClick={() => {
                  setActiveTabs((s) => ({ ...s, [f.id]: t.id }));
                  handleChange(f.id, t.label);
                }}
                data-testid={`tab-${f.id}-${t.id}`}
                className={`px-4 py-2 text-xs transition-colors flex items-center gap-2 ${
                  activeId === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                } ${idx > 0 ? "border-s border-border" : ""}`}
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

    const hasError = touched[f.id] && errors[f.id];

    return (
      <div key={f.id} className="space-y-1.5 animate-in" data-testid={`render-field-${f.id}`}>
        <FieldLabel field={f} />
        <MemoizedField
          field={f}
          value={ctx[f.id]}
          onChange={handleChange}
          onBlur={handleBlur}
          disabled={isFieldDisabled(f.id)}
          hasError={hasError}
        />
        {hasError && (
          <div className="text-[11px] text-red-500 font-medium mt-1 animate-in slide-in-from-top-1">
            {errors[f.id]}
          </div>
        )}
      </div>
    );
  };

  const renderedContent = useMemo(() => {
    return topLevelFields(fields).map(renderField);
  }, [fields, ctx, touched, errors, activeTabs, readOnly, fieldPermissions]);

  return (
    <div className="space-y-4">
      {renderedContent}
    </div>
  );
});

export default FormRenderer;

function FieldLabel({ field }) {
  return (
    <div className="flex items-center gap-1 text-sm font-medium text-foreground">
      {field.label}
      {field.required && <span className="text-red-500">*</span>}
    </div>
  );
}
