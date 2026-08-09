import React, { useState, useEffect, useMemo } from "react";
import { Trash2, Info, MessageSquare, Send, Settings2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { fromNow } from "@/lib/jalali";
import { OP_LABELS } from "@/lib/formLogic";
import { NODE_TYPES_META } from "@/lib/workflowUtils";

const ROLES = ["مدیر", "کارمند"];

export function Inspector({ selectedNode, selectedEdge, forms, users, nodes, edges, onNode, onEdge, onDeleteNode, onDeleteEdge, workflowId }) {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const targetId = selectedNode?.id;

  // Resolve fields of the form attached to the edge's source node (so we can
  // present a clean dropdown of fields when authoring the condition rule).
  const sourceFormFields = useMemo(() => {
    if (!selectedEdge) return [];
    const sourceNode = nodes.find(n => n.id === selectedEdge.source);
    if (!sourceNode) return [];
    // Walk upwards: include source node's own form, plus any earlier form nodes.
    const collected = [];
    const seen = new Set();
    const addFromNode = (n) => {
      const fid = n?.data?.form_id;
      if (!fid || seen.has(fid)) return;
      seen.add(fid);
      const form = forms.find(f => f.id === fid);
      if (form) collected.push(...(form.fields || []));
    };
    addFromNode(sourceNode);
    return collected;
  }, [selectedEdge, nodes, forms]);

  useEffect(() => {
    if (!targetId) { setComments([]); return; }
    api.get(`/comments?target_type=node&target_id=${targetId}`).then(r => setComments(r.data));
  }, [targetId]);

  const addComment = async () => {
    if (!newComment.trim() || !targetId) return;
    const r = await api.post("/comments", { target_type: "node", target_id: targetId, body: newComment });
    setComments((c) => [...c, r.data]);
    setNewComment("");
  };

  if (!selectedNode && !selectedEdge) {
    return (
      <aside className="hidden md:flex w-72 border-r border-border bg-card p-5 text-sm text-muted-foreground flex-col items-center justify-center text-center">
        <Settings2 className="w-6 h-6 mb-2" />
        برای ویرایش، روی یک گره یا اتصال کلیک کن.
      </aside>
    );
  }

  return (
    <aside className="w-80 lg:w-96 border-r border-border bg-card overflow-auto" data-testid="inspector">
      {selectedNode && (
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[10px] text-muted-foreground uppercase mono">{NODE_TYPES_META[selectedNode.data.nodeType]?.label || "گره"}</div>
              <div className="text-sm font-semibold mt-0.5">پیکربندی گره</div>
            </div>
            <button
              data-testid="delete-node-btn"
              onClick={() => onDeleteNode(selectedNode.id)}
              className="p-1.5 rounded-md hover:bg-red-50 text-red-600"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <div className="mb-5 bg-blue-50/50 border border-blue-100 rounded-lg p-3 flex gap-2.5">
            <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-blue-800 leading-relaxed space-y-1.5">
              <p className="font-medium">{NODE_TYPES_META[selectedNode.data.nodeType]?.description}</p>
              {["ai_task", "ocr_task"].includes(selectedNode.data.nodeType) && (
                <p className="text-blue-700/80 mt-1.5 pt-1.5 border-t border-blue-100/50">
                  راهنما: برای استفاده از مقادیر فرم‌های قبلی، نام فیلد را داخل آکولاد قرار دهید: <code className="bg-blue-100/50 px-1 py-0.5 rounded text-blue-700 font-mono" dir="ltr">{"{{form1.total_amount}}"}</code>
                </p>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">عنوان</label>
              <Input
                data-testid="node-label"
                value={selectedNode.data.label}
                onChange={(e) => onNode(selectedNode.id, { label: e.target.value })}
              />
            </div>

            {["task", "approval", "form"].includes(selectedNode.data.nodeType) && (
              <div className="space-y-3 border border-neutral-100 rounded-lg p-3 bg-muted/50">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">نحوه ارجاع تسک</label>
                  <Select
                    value={selectedNode.data.assignee_type || "role"}
                    onValueChange={(v) => onNode(selectedNode.id, { assignee_type: v, assignee_role: undefined, assignee_id: undefined })}
                  >
                    <SelectTrigger className="bg-card"><SelectValue placeholder="نحوه ارجاع" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="role">بر اساس نقش (گروهی)</SelectItem>
                      <SelectItem value="specific_user">کاربر مشخص</SelectItem>
                      <SelectItem value="manager">مدیر مستقیم ایجادکننده فرایند</SelectItem>
                      <SelectItem value="department_manager">مدیر دپارتمان ایجادکننده</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {(!selectedNode.data.assignee_type || selectedNode.data.assignee_type === "role") && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">انتخاب نقش مجری</label>
                    <Select
                      value={selectedNode.data.assignee_role || ""}
                      onValueChange={(v) => onNode(selectedNode.id, { assignee_role: v })}
                    >
                      <SelectTrigger className="bg-card"><SelectValue placeholder="انتخاب نقش" /></SelectTrigger>
                      <SelectContent>
                        {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {selectedNode.data.assignee_type === "specific_user" && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">انتخاب کاربر</label>
                    <Select
                      value={selectedNode.data.assignee_id || ""}
                      onValueChange={(v) => onNode(selectedNode.id, { assignee_id: v })}
                    >
                      <SelectTrigger className="bg-card"><SelectValue placeholder="انتخاب کاربر" /></SelectTrigger>
                      <SelectContent>
                        {(users || []).map(u => <SelectItem key={u.id} value={u.id}>{u.full_name} ({u.role})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
                {["manager", "department_manager"].includes(selectedNode.data.assignee_type) && (
                  <div className="text-[10px] text-amber-600 bg-amber-50 p-2 rounded border border-amber-100">
                    ارجاع به صورت خودکار بر اساس سلسله‌مراتب فرد ایجادکننده در زمان اجرای فرایند انجام می‌شود.
                  </div>
                )}
              </div>
            )}

            {selectedNode.data.nodeType === "form" && (
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">فرم</label>
                <Select
                  value={selectedNode.data.form_id || ""}
                  onValueChange={(v) => onNode(selectedNode.id, { form_id: v })}
                >
                  <SelectTrigger data-testid="node-form"><SelectValue placeholder="انتخاب فرم" /></SelectTrigger>
                  <SelectContent>
                    {forms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Field Permissions — show when a form is selected on form/approval nodes */}
            {["form", "approval"].includes(selectedNode.data.nodeType) && selectedNode.data.form_id && (() => {
              const selectedForm = forms.find(f => f.id === selectedNode.data.form_id);
              const formFields = (selectedForm?.fields || []).filter(f => !["heading", "divider", "tabs"].includes(f.type));
              if (formFields.length === 0) return null;
              const perms = selectedNode.data.field_permissions || {};
              return (
                <div data-testid="field-permissions-section">
                  <label className="text-xs text-muted-foreground mb-2 block">سطح دسترسی فیلدها</label>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {formFields.map(ff => (
                      <div key={ff.id} className="flex items-center gap-2 text-xs bg-muted border border-neutral-100 rounded-md px-2.5 py-1.5">
                        <span className="flex-1 truncate text-muted-foreground">{ff.label}</span>
                        <select
                          value={perms[ff.id] || "editable"}
                          onChange={(e) => {
                            const newPerms = { ...perms, [ff.id]: e.target.value };
                            onNode(selectedNode.id, { field_permissions: newPerms });
                          }}
                          className="text-[11px] bg-card border border-border rounded px-1.5 py-0.5 focus:outline-none"
                        >
                          <option value="editable">قابل ویرایش</option>
                          <option value="readonly">فقط‌خواندنی</option>
                          <option value="hidden">مخفی</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {selectedNode.data.nodeType === "condition" && (
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">عبارت شرطی</label>
                <Input
                  data-testid="node-expression"
                  dir="ltr"
                  value={selectedNode.data.expression || ""}
                  onChange={(e) => onNode(selectedNode.id, { expression: e.target.value })}
                  placeholder="amount > 1000000"
                />
              </div>
            )}

            {selectedNode.data.nodeType === "ai_task" && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">پرامپت سیستم (System Prompt)</label>
                  <Textarea
                    data-testid="node-ai-prompt"
                    dir="ltr"
                    value={selectedNode.data.system_prompt || ""}
                    onChange={(e) => onNode(selectedNode.id, { system_prompt: e.target.value })}
                    placeholder="You are an AI assistant. Use context: {{form_id.field_name}}"
                    rows={6}
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    شما می‌توانید از مقادیر فرم‌های قبلی با استفاده از سینتکس <code className="bg-muted text-purple-600 px-1 py-0.5 rounded">{"{{form_name.field_name}}"}</code> استفاده کنید.
                  </p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">کلید خروجی (Output Key)</label>
                  <Input
                    data-testid="node-ai-output"
                    dir="ltr"
                    value={selectedNode.data.output_key || ""}
                    onChange={(e) => onNode(selectedNode.id, { output_key: e.target.value })}
                    placeholder="ai_evaluation"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    نتیجه (JSON) در این کلید در Context ذخیره می‌شود.
                  </p>
                </div>
              </div>
            )}

            {selectedNode.data.nodeType === "ocr_task" && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">متغیر فایل منبع (Source File)</label>
                  <Input
                    data-testid="node-ocr-source"
                    dir="ltr"
                    value={selectedNode.data.source_file_variable || ""}
                    onChange={(e) => onNode(selectedNode.id, { source_file_variable: e.target.value })}
                    placeholder="{{form1.receipt_image}}"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    آدرس تصویر یا فایل در Context.
                  </p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">پرامپت استخراج (Extraction Prompt)</label>
                  <Textarea
                    data-testid="node-ocr-prompt"
                    dir="ltr"
                    value={selectedNode.data.extraction_prompt || ""}
                    onChange={(e) => onNode(selectedNode.id, { extraction_prompt: e.target.value })}
                    placeholder="Extract total amount and vendor name..."
                    rows={4}
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    دقیقاً چه اطلاعاتی از تصویر استخراج شود؟ (JSON خروجی بر این اساس است)
                  </p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">کلید خروجی (Output Key)</label>
                  <Input
                    data-testid="node-ocr-output"
                    dir="ltr"
                    value={selectedNode.data.output_key || ""}
                    onChange={(e) => onNode(selectedNode.id, { output_key: e.target.value })}
                    placeholder="ocr_result"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    نتیجه (JSON) در این کلید در Context ذخیره می‌شود.
                  </p>
                </div>
              </div>
            )}

            {selectedNode.data.nodeType === "cron" && (
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">عبارت کران (Cron Expression)</label>
                <Input
                  dir="ltr"
                  value={selectedNode.data.cron_expression || ""}
                  onChange={(e) => onNode(selectedNode.id, { cron_expression: e.target.value })}
                  placeholder="* * * * *"
                />
                <p className="text-[10px] text-muted-foreground mt-1">فرمت استاندارد (دقیقه، ساعت، روز، ماه، روز هفته)</p>
              </div>
            )}

            {selectedNode.data.nodeType === "parallel" && (
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">گره‌های پیش‌نیاز (Wait Conditions)</label>
                <div className="space-y-2 mt-2">
                  {edges.filter(e => e.target === selectedNode.id).map(edge => {
                    const src = nodes.find(n => n.id === edge.source);
                    if (!src) return null;
                    const isChecked = (selectedNode.data.dependencies || []).includes(src.id);
                    return (
                      <label key={src.id} className="flex items-center gap-2 text-sm text-muted-foreground bg-muted border border-neutral-100 p-2 rounded cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            let deps = selectedNode.data.dependencies || [];
                            if (e.target.checked) deps = [...deps, src.id];
                            else deps = deps.filter(id => id !== src.id);
                            onNode(selectedNode.id, { dependencies: deps });
                          }}
                        />
                        <span className="mono text-[10px] text-muted-foreground">[{src.data.nodeType}]</span> {src.data.label}
                      </label>
                    );
                  })}
                  {edges.filter(e => e.target === selectedNode.id).length === 0 && (
                    <div className="text-xs text-muted-foreground">هیچ گره ورودی به این گره متصل نیست.</div>
                  )}
                </div>
              </div>
            )}

            {/* Timeout & Retry Settings */}
            {["task", "approval", "form"].includes(selectedNode.data.nodeType) && (
              <div className="space-y-4 pt-4 border-t border-neutral-100">
                <div className="text-sm font-semibold text-foreground">تنظیمات پیشرفته (اختیاری)</div>
                
                <div className="space-y-3 bg-muted/50 border border-neutral-100 p-3 rounded-lg">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">زمان انقضا (ثانیه)</label>
                    <Input
                      type="number"
                      placeholder="مثلاً: 3600 (یک ساعت)"
                      value={selectedNode.data.timeout_seconds || ""}
                      onChange={(e) => onNode(selectedNode.id, { timeout_seconds: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                      className="bg-card text-xs"
                    />
                    <div className="text-[10px] text-muted-foreground mt-1">در صورت خالی بودن، زمان انقضا پیش‌فرض سیستم (۳ روز) در نظر گرفته می‌شود.</div>
                  </div>
                  
                  {selectedNode.data.timeout_seconds > 0 && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">واکنش پس از انقضا (Escalation)</label>
                      <Select
                        value={selectedNode.data.timeout_action || "none"}
                        onValueChange={(v) => onNode(selectedNode.id, { timeout_action: v })}
                      >
                        <SelectTrigger className="bg-card text-xs"><SelectValue placeholder="انتخاب واکنش" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="text-xs">هیچ کاری نکن</SelectItem>
                          <SelectItem value="escalate_to_manager" className="text-xs">ارجاع به مدیر شخص (تشدید)</SelectItem>
                          <SelectItem value="auto_reject" className="text-xs">رد خودکار تسک</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="space-y-3 bg-muted/50 border border-neutral-100 p-3 rounded-lg">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">تعداد تلاش مجدد (Retry)</label>
                    <Input
                      type="number"
                      placeholder="مثلاً: 3"
                      value={selectedNode.data.retry_count || ""}
                      onChange={(e) => onNode(selectedNode.id, { retry_count: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                      className="bg-card text-xs"
                    />
                  </div>
                  {selectedNode.data.retry_count > 0 && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">تاخیر بین تلاش‌ها (ثانیه)</label>
                      <Input
                        type="number"
                        placeholder="مثلاً: 60"
                        value={selectedNode.data.retry_delay || ""}
                        onChange={(e) => onNode(selectedNode.id, { retry_delay: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                        className="bg-card text-xs"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Inline comments */}
          <div className="mt-6 pt-5 border-t border-neutral-100">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
              <MessageSquare className="w-3.5 h-3.5" />
              نظرات روی گره
              <span className="fa-nums">({comments.length})</span>
            </div>
            <ul className="space-y-3 mb-3">
              {comments.map(c => (
                <li key={c.id} className="text-xs bg-muted border border-neutral-100 rounded-lg p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-foreground">{c.author_name}</span>
                    <span className="text-muted-foreground text-[10px]">{fromNow(c.created_at)}</span>
                  </div>
                  <div className="text-muted-foreground leading-6">{c.body}</div>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-2">
              <Input
                data-testid="node-comment-input"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="نظری اضافه کن…"
              />
              <Button data-testid="node-comment-send" size="sm" onClick={addComment} className="bg-primary text-primary-foreground">
                <Send className="w-3.5 h-3.5 rotate-180" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {selectedEdge && (
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[10px] text-muted-foreground uppercase mono">اتصال</div>
              <div className="text-sm font-semibold mt-0.5">پیکربندی شرط</div>
            </div>
            <button data-testid="delete-edge-btn" onClick={() => onDeleteEdge(selectedEdge.id)} className="p-1.5 rounded-md hover:bg-red-50 text-red-600">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">برچسب نمایشی</label>
              <Input
                data-testid="edge-label"
                value={selectedEdge.label || ""}
                onChange={(e) => onEdge(selectedEdge.id, { label: e.target.value })}
                placeholder="مثلاً: بله / خیر"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground">قاعده شرط</label>
                {selectedEdge.data?.condition && (
                  <button
                    data-testid="edge-rule-clear"
                    onClick={() => onEdge(selectedEdge.id, { data: { ...(selectedEdge.data || {}), condition: null } })}
                    className="text-[11px] text-muted-foreground hover:text-red-600"
                  >پاک‌سازی</button>
                )}
              </div>
              <EdgeRuleBuilder
                rule={selectedEdge.data?.condition || null}
                sourceFormFields={sourceFormFields}
                onChange={(r) => onEdge(selectedEdge.id, { data: { ...(selectedEdge.data || {}), condition: r } })}
              />
              <p className="text-[11px] text-muted-foreground leading-5">
                اگر شرط برقرار باشد، فرایند از این مسیر ادامه پیدا می‌کند. مسیرهای بدون شرط به‌عنوان «پیش‌فرض» وقتی استفاده می‌شوند که هیچ شرطی مطابقت ندهد.
              </p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

function EdgeRuleBuilder({ rule, sourceFormFields, onChange }) {
  // Build choices: explicit form fields + a few synthetic context keys
  const synthetic = [
    { id: "_task_status", label: "وضعیت تسک قبلی", type: "select", options: ["approved", "rejected", "done"] },
  ];
  const choices = [...sourceFormFields.filter(f => !["heading", "divider", "tabs"].includes(f.type)), ...synthetic];

  if (!rule) {
    return (
      <button
        data-testid="add-edge-rule"
        onClick={() => onChange({ field_id: choices[0]?.id || "_task_status", op: "=", value: "" })}
        className="w-full text-sm py-2 px-3 border border-dashed border-border rounded-lg hover:border-neutral-900 hover:bg-muted text-muted-foreground"
      >
        + افزودن قاعده شرطی
      </button>
    );
  }

  const ctl = choices.find(c => c.id === rule.field_id);
  const opNeedsValue = !["empty", "not_empty"].includes(rule.op);

  return (
    <div className="bg-muted/60 border border-border rounded-lg p-3 space-y-2">
      <div className="space-y-1.5">
        <div className="text-[10px] text-muted-foreground">فیلد</div>
        <Select value={rule.field_id} onValueChange={(v) => onChange({ ...rule, field_id: v })}>
          <SelectTrigger data-testid="edge-rule-field"><SelectValue placeholder="انتخاب فیلد" /></SelectTrigger>
          <SelectContent>
            {choices.map(c => (
              <SelectItem key={c.id} value={c.id}>
                {c.label}{c.id.startsWith("_") ? "  •  context" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <div className="text-[10px] text-muted-foreground">عملگر</div>
        <Select value={rule.op} onValueChange={(v) => onChange({ ...rule, op: v })}>
          <SelectTrigger data-testid="edge-rule-op"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(OP_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {opNeedsValue && (
        <div className="space-y-1.5">
          <div className="text-[10px] text-muted-foreground">مقدار</div>
          {(ctl?.type === "select" || ctl?.type === "tabs" || ctl?.options) ? (
            <Select value={rule.value || ""} onValueChange={(v) => onChange({ ...rule, value: v })}>
              <SelectTrigger data-testid="edge-rule-value-select"><SelectValue placeholder="انتخاب…" /></SelectTrigger>
              <SelectContent>
                {(ctl.type === "tabs" ? (ctl.tab_options || []).map(t => t.label) : (ctl.options || [])).map(o =>
                  <SelectItem key={o} value={o}>{o}</SelectItem>
                )}
              </SelectContent>
            </Select>
          ) : (
            <Input data-testid="edge-rule-value-input" value={rule.value || ""} onChange={(e) => onChange({ ...rule, value: e.target.value })} />
          )}
        </div>
      )}
    </div>
  );
}
