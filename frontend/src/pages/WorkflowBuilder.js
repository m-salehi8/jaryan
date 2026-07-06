import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import ReactFlow, {
  Background, Controls, MiniMap, applyNodeChanges, applyEdgeChanges,
  addEdge, Handle, Position, MarkerType, useReactFlow, ReactFlowProvider,
} from "reactflow";
import "reactflow/dist/style.css";
import {
  PlayCircle, Save, Trash2, Plus, ArrowRight, MessageSquare,
  Zap, FileText, CheckCircle2, GitBranch, Square, Settings2, X, Send, Loader2, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { api, streamAI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fromNow } from "@/lib/jalali";
import { OP_LABELS } from "@/lib/formLogic";

const NODE_TYPES_META = {
  trigger:   { label: "شروع",     icon: Zap,          bar: "#10b981" },
  task:      { label: "تسک",      icon: Square,       bar: "#737373" },
  approval:  { label: "تایید",    icon: CheckCircle2, bar: "#2563eb" },
  condition: { label: "شرط",      icon: GitBranch,    bar: "#ca8a04" },
  form:      { label: "فرم",      icon: FileText,     bar: "#7c3aed" },
  end:       { label: "پایان",    icon: Square,       bar: "#171717" },
};
const ROLES = ["ادمین سازمان", "طراح فرایند", "مدیر تیم", "کارمند"];

// Custom node renderer (monochromatic, top colored bar by type)
function FlowNode({ data, selected, id }) {
  const meta = NODE_TYPES_META[data.nodeType] || NODE_TYPES_META.task;
  const Icon = meta.icon;
  return (
    <div
      data-testid={`canvas-node-${id}`}
      className={`bg-white border ${selected ? "border-neutral-900 shadow-sm" : "border-neutral-200"} rounded-xl min-w-[200px] overflow-hidden transition-all`}
      style={{ direction: "rtl" }}
    >
      <Handle type="target" position={Position.Left} />
      <div className="h-1" style={{ background: meta.bar }} />
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2 text-[10px] text-neutral-400 mono uppercase mb-1">
          <Icon className="w-3 h-3" />
          {meta.label}
        </div>
        <div className="text-sm font-medium text-neutral-900 leading-5">{data.label}</div>
        {data.assignee_role && (
          <div className="text-[10px] text-neutral-500 mt-1.5 inline-flex items-center px-1.5 py-0.5 rounded bg-neutral-50 border border-neutral-100">
            {data.assignee_role}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { custom: FlowNode };
const edgeTypes = {};

// Convert workflow JSON ↔ reactflow nodes/edges
function toRF(wf) {
  return {
    nodes: (wf.nodes || []).map((n) => ({
      id: n.id,
      type: "custom",
      position: n.position || { x: 80, y: 120 },
      data: { label: n.label, nodeType: n.type, ...(n.data || {}) },
    })),
    edges: (wf.edges || []).map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label || "",
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed, color: "#525252" },
      data: { condition: e.condition },
    })),
  };
}
function fromRF(nodes, edges) {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.data.nodeType,
      label: n.data.label,
      position: n.position,
      data: {
        ...(n.data.assignee_role ? { assignee_role: n.data.assignee_role } : {}),
        ...(n.data.form_id ? { form_id: n.data.form_id } : {}),
        ...(n.data.expression ? { expression: n.data.expression } : {}),
      },
    })),
    edges: edges.map((e) => ({
      id: e.id, source: e.source, target: e.target,
      label: e.label || null, condition: e.data?.condition || null,
    })),
  };
}

export default function WorkflowBuilder() {
  const { id } = useParams();
  const nav = useNavigate();
  const [wf, setWf] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selected, setSelected] = useState(null); // node or edge id
  const [forms, setForms] = useState([]);
  const [saving, setSaving] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  // Load
  useEffect(() => {
    Promise.all([api.get(`/workflows/${id}`), api.get("/forms")])
      .then(([w, f]) => {
        setWf(w.data);
        const rf = toRF(w.data);
        setNodes(rf.nodes);
        setEdges(rf.edges);
        setForms(f.data);
      })
      .catch(() => { toast.error("فرایند یافت نشد"); nav("/admin/workflows"); });
  }, [id, nav]);

  // Handlers
  const onNodesChange = useCallback((c) => setNodes((nds) => applyNodeChanges(c, nds)), []);
  const onEdgesChange = useCallback((c) => setEdges((eds) => applyEdgeChanges(c, eds)), []);
  const onConnect = useCallback(
    (conn) => setEdges((eds) => addEdge({
      ...conn,
      id: `e_${Date.now()}`,
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed, color: "#525252" },
    }, eds)),
    []
  );

  // Auto-save when a node drag completes (positions changed)
  const saveSilently = useCallback(async (latestNodes, latestEdges) => {
    try {
      const payload = fromRF(latestNodes ?? nodes, latestEdges ?? edges);
      await api.patch(`/workflows/${id}`, payload);
    } catch (e) { /* swallow background save errors */ }
  }, [id, nodes, edges]);

  const onNodeDragStop = useCallback(() => {
    saveSilently();
  }, [saveSilently]);

  const addNode = (nodeType) => {
    const id = `n_${Date.now()}`;
    const last = nodes[nodes.length - 1];
    const pos = last
      ? { x: (last.position?.x ?? 80) + 260, y: last.position?.y ?? 160 }
      : { x: 120, y: 160 };
    setNodes((n) => [...n, {
      id, type: "custom", position: pos,
      data: { label: NODE_TYPES_META[nodeType].label, nodeType },
    }]);
  };

  const updateNode = (nodeId, patch) => {
    setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n));
  };

  const deleteNode = (nodeId) => {
    setNodes((nds) => nds.filter(n => n.id !== nodeId));
    setEdges((eds) => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
    setSelected(null);
  };

  const updateEdge = (edgeId, patch) => {
    setEdges((eds) => eds.map((e) => e.id === edgeId ? { ...e, ...patch, data: { ...e.data, ...(patch.data || {}) } } : e));
  };
  const deleteEdge = (edgeId) => {
    setEdges((eds) => eds.filter(e => e.id !== edgeId));
    setSelected(null);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = fromRF(nodes, edges);
      await api.patch(`/workflows/${id}`, payload);
      toast.success("ذخیره شد");
    } catch { toast.error("خطا در ذخیره"); }
    finally { setSaving(false); }
  };

  const publish = async () => {
    const payload = { ...fromRF(nodes, edges), status: "published" };
    await api.patch(`/workflows/${id}`, payload);
    setWf((w) => ({ ...w, status: "published" }));
    toast.success("فرایند منتشر شد");
  };

  const startInstance = async () => {
    if (wf.status !== "published") {
      toast.error("ابتدا فرایند را منتشر کنید");
      return;
    }
    try {
      await api.post(`/workflows/${id}/start`);
      toast.success("اجرای فرایند آغاز شد");
    } catch (e) {
      const msg = e?.response?.data?.detail === "workflow_not_published" ? "فرایند منتشر نشده است" : "خطا در اجرا";
      toast.error(msg);
    }
  };

  const selectedNode = selected?.kind === "node" ? nodes.find(n => n.id === selected.id) : null;
  const selectedEdge = selected?.kind === "edge" ? edges.find(e => e.id === selected.id) : null;

  if (!wf) return <div className="p-10 text-sm text-neutral-400">در حال بارگذاری…</div>;

  return (
    <div className="h-[calc(100vh-56px)] md:h-screen flex flex-col" data-testid="builder-root" data-tour-id="tour-workflow-canvas">
      {/* Topbar */}
      <div className="border-b border-neutral-200 bg-white px-4 lg:px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/admin/workflows" className="text-neutral-400 hover:text-neutral-900">
            <ArrowRight className="w-4 h-4" />
          </Link>
          <input
            data-testid="builder-name"
            value={wf.name}
            onChange={(e) => setWf({ ...wf, name: e.target.value })}
            onBlur={() => api.patch(`/workflows/${id}`, { name: wf.name })}
            className="text-base font-semibold bg-transparent border-0 focus:outline-none min-w-0"
          />
          <span className={`text-[10px] px-2 py-0.5 rounded-md font-semibold ${
            wf.status === "published"
              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
              : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
          }`}>{wf.status === "published" ? "منتشر شده" : "پیش‌نویس"}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button data-testid="builder-ai-btn" variant="outline" size="sm" onClick={() => setAiOpen(true)}>
            <Sparkles className="w-4 h-4 me-1" /> هوش مصنوعی
          </Button>
          <Button data-testid="builder-save" variant="outline" size="sm" onClick={save} disabled={saving}>
            <Save className="w-4 h-4 me-1" /> ذخیره
          </Button>
          <Button data-testid="builder-publish" size="sm" className="bg-brand hover:bg-brand-strong text-white font-semibold" onClick={publish}>
            انتشار
          </Button>
          <Button
            data-testid="builder-start"
            size="sm"
            variant="outline"
            onClick={startInstance}
            disabled={wf.status !== "published"}
            title={wf.status !== "published" ? "ابتدا منتشر کنید" : "اجرا"}
          >
            <PlayCircle className="w-4 h-4 me-1" /> اجرا
          </Button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Node palette */}
        <div className="hidden lg:flex w-56 border-l border-neutral-200 bg-white p-3 flex-col gap-2" data-testid="node-palette">
          <div className="text-[10px] text-neutral-400 uppercase tracking-wider px-1 mono">گره‌ها</div>
          {Object.entries(NODE_TYPES_META).map(([k, m]) => {
            const Icon = m.icon;
            return (
              <button
                key={k}
                data-testid={`palette-${k}`}
                onClick={() => addNode(k)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-200 hover:border-neutral-900 hover:bg-neutral-50 text-sm text-right transition-colors"
              >
                <span className="w-1 h-4 rounded-sm" style={{ background: m.bar }} />
                <Icon className="w-3.5 h-3.5 text-neutral-500" />
                <span className="flex-1 text-right">{m.label}</span>
                <Plus className="w-3.5 h-3.5 text-neutral-300" />
              </button>
            );
          })}
        </div>

        {/* Canvas */}
        <div className="flex-1 min-w-0 relative" style={{ direction: "ltr" }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDragStop={onNodeDragStop}
            onNodeClick={(_, n) => setSelected({ kind: "node", id: n.id })}
            onEdgeClick={(_, e) => setSelected({ kind: "edge", id: e.id })}
            onPaneClick={() => setSelected(null)}
            fitView
            fitViewOptions={{ padding: 0.25 }}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={24} size={1.2} color="#d4d4d4" />
            <Controls position="bottom-left" />
            <MiniMap pannable zoomable className="!bg-white !border !border-neutral-200 !rounded-lg" />
          </ReactFlow>

          {/* Mobile floating palette */}
          <div className="lg:hidden absolute bottom-4 right-4 flex flex-wrap gap-2 max-w-[80%] justify-end">
            {Object.entries(NODE_TYPES_META).map(([k, m]) => (
              <button
                key={k}
                data-testid={`m-palette-${k}`}
                onClick={() => addNode(k)}
                className="text-xs px-2.5 py-1.5 rounded-md bg-white border border-neutral-200 hover:bg-neutral-50"
                style={{ direction: "rtl" }}
              >
                + {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Inspector */}
        <Inspector
          selectedNode={selectedNode}
          selectedEdge={selectedEdge}
          forms={forms}
          nodes={nodes}
          onNode={updateNode}
          onEdge={updateEdge}
          onDeleteNode={deleteNode}
          onDeleteEdge={deleteEdge}
          targetType="node"
          workflowId={id}
        />
      </div>

      {aiOpen && (
        <AIPanel
          onClose={() => setAiOpen(false)}
          onApply={(gen) => {
            const rf = toRF(gen);
            setNodes(rf.nodes);
            setEdges(rf.edges);
            setWf((w) => ({ ...w, name: gen.name || w.name, description: gen.description || w.description }));
            setAiOpen(false);
            toast.success("فرایند با هوش مصنوعی به‌روز شد");
          }}
        />
      )}
    </div>
  );
}

function Inspector({ selectedNode, selectedEdge, forms, nodes, onNode, onEdge, onDeleteNode, onDeleteEdge, workflowId }) {
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
      <aside className="hidden md:flex w-72 border-r border-neutral-200 bg-white p-5 text-sm text-neutral-400 flex-col items-center justify-center text-center">
        <Settings2 className="w-6 h-6 mb-2" />
        برای ویرایش، روی یک گره یا اتصال کلیک کن.
      </aside>
    );
  }

  return (
    <aside className="w-80 lg:w-96 border-r border-neutral-200 bg-white overflow-auto" data-testid="inspector">
      {selectedNode && (
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[10px] text-neutral-400 uppercase mono">{NODE_TYPES_META[selectedNode.data.nodeType]?.label || "گره"}</div>
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

          <div className="space-y-4">
            <div>
              <label className="text-xs text-neutral-500 mb-1.5 block">عنوان</label>
              <Input
                data-testid="node-label"
                value={selectedNode.data.label}
                onChange={(e) => onNode(selectedNode.id, { label: e.target.value })}
              />
            </div>

            {["task", "approval", "form"].includes(selectedNode.data.nodeType) && (
              <div>
                <label className="text-xs text-neutral-500 mb-1.5 block">نقش مجری</label>
                <Select
                  value={selectedNode.data.assignee_role || ""}
                  onValueChange={(v) => onNode(selectedNode.id, { assignee_role: v })}
                >
                  <SelectTrigger data-testid="node-role"><SelectValue placeholder="انتخاب نقش" /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedNode.data.nodeType === "form" && (
              <div>
                <label className="text-xs text-neutral-500 mb-1.5 block">فرم</label>
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

            {selectedNode.data.nodeType === "condition" && (
              <div>
                <label className="text-xs text-neutral-500 mb-1.5 block">عبارت شرطی</label>
                <Input
                  data-testid="node-expression"
                  dir="ltr"
                  value={selectedNode.data.expression || ""}
                  onChange={(e) => onNode(selectedNode.id, { expression: e.target.value })}
                  placeholder="amount > 1000000"
                />
              </div>
            )}
          </div>

          {/* Inline comments */}
          <div className="mt-6 pt-5 border-t border-neutral-100">
            <div className="flex items-center gap-2 text-xs text-neutral-500 mb-3">
              <MessageSquare className="w-3.5 h-3.5" />
              نظرات روی گره
              <span className="fa-nums">({comments.length})</span>
            </div>
            <ul className="space-y-3 mb-3">
              {comments.map(c => (
                <li key={c.id} className="text-xs bg-neutral-50 border border-neutral-100 rounded-lg p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-neutral-900">{c.author_name}</span>
                    <span className="text-neutral-400 text-[10px]">{fromNow(c.created_at)}</span>
                  </div>
                  <div className="text-neutral-700 leading-6">{c.body}</div>
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
              <Button data-testid="node-comment-send" size="sm" onClick={addComment} className="bg-neutral-900 text-white">
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
              <div className="text-[10px] text-neutral-400 uppercase mono">اتصال</div>
              <div className="text-sm font-semibold mt-0.5">پیکربندی شرط</div>
            </div>
            <button data-testid="delete-edge-btn" onClick={() => onDeleteEdge(selectedEdge.id)} className="p-1.5 rounded-md hover:bg-red-50 text-red-600">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-neutral-500 mb-1.5 block">برچسب نمایشی</label>
              <Input
                data-testid="edge-label"
                value={selectedEdge.label || ""}
                onChange={(e) => onEdge(selectedEdge.id, { label: e.target.value })}
                placeholder="مثلاً: بله / خیر"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-neutral-500">قاعده شرط</label>
                {selectedEdge.data?.condition && (
                  <button
                    data-testid="edge-rule-clear"
                    onClick={() => onEdge(selectedEdge.id, { data: { ...(selectedEdge.data || {}), condition: null } })}
                    className="text-[11px] text-neutral-400 hover:text-red-600"
                  >پاک‌سازی</button>
                )}
              </div>
              <EdgeRuleBuilder
                rule={selectedEdge.data?.condition || null}
                sourceFormFields={sourceFormFields}
                onChange={(r) => onEdge(selectedEdge.id, { data: { ...(selectedEdge.data || {}), condition: r } })}
              />
              <p className="text-[11px] text-neutral-400 leading-5">
                اگر شرط برقرار باشد، فرایند از این مسیر ادامه پیدا می‌کند. مسیرهای بدون شرط به‌عنوان «پیش‌فرض» وقتی استفاده می‌شوند که هیچ شرطی مطابقت ندهد.
              </p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

function AIPanel({ onClose, onApply }) {
  const [message, setMessage] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [text, setText] = useState("");
  const [wf, setWf] = useState(null);
  const [sessionId] = useState(() => crypto.randomUUID());

  const send = async () => {
    if (!message.trim()) return;
    setStreaming(true);
    setText("");
    setWf(null);
    await streamAI(
      message,
      sessionId,
      (d) => setText(prev => prev + d),
      (gen) => { setStreaming(false); if (gen?.nodes) setWf(gen); },
      () => { setStreaming(false); toast.error("خطا در دریافت پاسخ"); }
    );
  };

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" data-testid="ai-panel">
      <div className="bg-white rounded-xl border border-neutral-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-200">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            <div className="text-sm font-semibold">ساخت با هوش مصنوعی</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-neutral-100"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 flex-1 overflow-auto">
          <div className="space-y-3">
            <Textarea
              data-testid="ai-panel-input"
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="مثلاً: فرایند درخواست خرید با تایید دو سطحه طراحی کن"
            />
            <Button data-testid="ai-panel-send" disabled={streaming} onClick={send} className="bg-neutral-900 text-white">
              {streaming ? (<><Loader2 className="w-4 h-4 me-1 animate-spin" /> در حال تولید…</>) : "تولید فرایند"}
            </Button>
          </div>
          {text && (
            <div className="mt-5 bg-neutral-50 border border-neutral-100 rounded-lg p-3 text-sm leading-7 text-neutral-700 whitespace-pre-wrap">
              {text.replace(/```json[\s\S]*?```/g, "").trim()}
            </div>
          )}
          {wf?.nodes && (
            <div className="mt-3 border border-neutral-200 rounded-lg p-3">
              <div className="text-xs text-neutral-500 mb-2">پیش‌نمایش گره‌ها: <span className="fa-nums">{wf.nodes.length}</span></div>
              <div className="flex flex-wrap gap-2">
                {wf.nodes.map((n) => (
                  <div key={n.id} className="text-[11px] border border-neutral-200 rounded-md px-2 py-1">
                    <span className="text-neutral-400 mono me-1">{n.type}</span> {n.label}
                  </div>
                ))}
              </div>
              <div className="mt-3 flex justify-end">
                <Button data-testid="ai-panel-apply" onClick={() => onApply(wf)} className="bg-neutral-900 text-white">
                  جایگزینی روی بوم
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


/* ---------- Edge rule builder (visual condition author) ---------- */
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
        className="w-full text-sm py-2 px-3 border border-dashed border-neutral-300 rounded-lg hover:border-neutral-900 hover:bg-neutral-50 text-neutral-600"
      >
        + افزودن قاعده شرطی
      </button>
    );
  }

  const ctl = choices.find(c => c.id === rule.field_id);
  const opNeedsValue = !["empty", "not_empty"].includes(rule.op);

  return (
    <div className="bg-neutral-50/60 border border-neutral-200 rounded-lg p-3 space-y-2">
      <div className="space-y-1.5">
        <div className="text-[10px] text-neutral-400">فیلد</div>
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
        <div className="text-[10px] text-neutral-400">عملگر</div>
        <Select value={rule.op} onValueChange={(v) => onChange({ ...rule, op: v })}>
          <SelectTrigger data-testid="edge-rule-op"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(OP_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {opNeedsValue && (
        <div className="space-y-1.5">
          <div className="text-[10px] text-neutral-400">مقدار</div>
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
