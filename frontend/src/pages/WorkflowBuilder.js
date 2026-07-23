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
  Clock, Split, Wand2, Bot, ScanText, Activity, Bug, ChevronDown, ChevronUp, Info, List,
} from "lucide-react";
import dagre from "dagre";
import { toast } from "sonner";
import { api, streamAI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fromNow } from "@/lib/jalali";
import { OP_LABELS } from "@/lib/formLogic";

import AIAgentNode from "@/components/AIAgentNode";
import OCRNode from "@/components/OCRNode";

export const NODE_TYPES_META = {
  trigger:   { label: "شروع دستی",    icon: Zap,          bar: "#10b981", description: "آغاز فرایند به‌صورت دستی توسط کاربر." },
  cron:      { label: "شروع زمان‌دار", icon: Clock,        bar: "#10b981", description: "اجرای خودکار فرایند در زمان‌های برنامه‌ریزی‌شده." },
  task:      { label: "تسک",          icon: Square,       bar: "#737373", description: "انجام یک وظیفه مشخص توسط شخص یا سیستم." },
  approval:  { label: "تایید",        icon: CheckCircle2, bar: "#2563eb", description: "نیاز به تایید یا رد درخواست توسط مدیر یا شخص مسئول." },
  condition: { label: "شرط",          icon: GitBranch,    bar: "#ca8a04", description: "مسیریابی فرایند بر اساس شروط منطقی (مثلاً مبلغ > 1000)." },
  parallel:  { label: "موازی (AND)",  icon: Split,        bar: "#ec4899", description: "اجرای همزمان چندین مسیر و انتظار برای تکمیل همه آن‌ها." },
  form:      { label: "فرم",          icon: FileText,     bar: "#7c3aed", description: "دریافت اطلاعات از کاربر از طریق یک فرم." },
  ai_task:   { label: "هوش مصنوعی",    icon: Bot,          bar: "linear-gradient(to right, #a855f7, #6366f1)", description: "تصمیم‌گیری و پردازش خودکار با هوش مصنوعی بر اساس متغیرها." },
  ocr_task:  { label: "پردازش سند / OCR", icon: ScanText,  bar: "linear-gradient(to right, #14b8a6, #06b6d4)", description: "استخراج هوشمند اطلاعات از تصاویر و فاکتورها." },
  end:       { label: "پایان",        icon: Square,       bar: "#171717", description: "نقطه پایان فرایند." },
};
const ROLES = ["ادمین سازمان", "طراح فرایند", "مدیر تیم", "کارمند"];

// Custom node renderer (monochromatic, top colored bar by type)
function FlowNode({ data, selected, id }) {
  const meta = NODE_TYPES_META[data.nodeType] || NODE_TYPES_META.task;
  const Icon = meta.icon;
  return (
    <div
      data-testid={`canvas-node-${id}`}
      className={`bg-card border ${selected ? "border-neutral-900 shadow-md" : "border-border shadow-sm hover:shadow-md"} rounded-xl min-w-[200px] overflow-hidden transition-all`}
      style={{ direction: "rtl" }}
    >
      <Handle type="target" position={Position.Left} />
      <div className="h-1" style={{ background: meta.bar }} />
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mono uppercase mb-1">
          <Icon className="w-3 h-3" />
          {meta.label}
        </div>
        <div className="text-sm font-medium text-foreground leading-5">{data.label}</div>
        {data.assignee_role && (
          <div className="text-[10px] text-muted-foreground mt-1.5 inline-flex items-center px-1.5 py-0.5 rounded bg-muted border border-neutral-100">
            {data.assignee_role}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { custom: FlowNode, ai_task: AIAgentNode, ocr_task: OCRNode };
const edgeTypes = {};

// Convert workflow JSON ↔ reactflow nodes/edges
export function toRF(wf) {
  return {
    nodes: (wf.nodes || []).map((n) => ({
      id: n.id,
      type: (n.type === "ai_task" || n.type === "ocr_task") ? n.type : "custom",
      position: n.position || { x: 80, y: 120 },
      data: { 
        label: n.label, 
        nodeType: n.type, 
        timeout_seconds: n.timeout_seconds,
        timeout_action: n.timeout_action,
        retry_count: n.retry_count,
        retry_delay: n.retry_delay,
        ...(n.data || {}) 
      },
    })),
    edges: (wf.edges || []).map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label || "",
      type: "step",
      markerEnd: { type: MarkerType.ArrowClosed, color: "#525252" },
      data: { condition: e.condition },
    })),
  };
}
export function fromRF(nodes, edges) {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.data.nodeType,
      label: n.data.label,
      position: n.position,
      data: {
        ...(n.data.assignee_type ? { assignee_type: n.data.assignee_type } : {}),
        ...(n.data.assignee_role ? { assignee_role: n.data.assignee_role } : {}),
        ...(n.data.assignee_id ? { assignee_id: n.data.assignee_id } : {}),
        ...(n.data.form_id ? { form_id: n.data.form_id } : {}),
        ...(n.data.expression ? { expression: n.data.expression } : {}),
        ...(n.data.dependencies ? { dependencies: n.data.dependencies } : {}),
        ...(n.data.cron_expression ? { cron_expression: n.data.cron_expression } : {}),
        ...(n.data.system_prompt ? { system_prompt: n.data.system_prompt } : {}),
        ...(n.data.extraction_prompt ? { extraction_prompt: n.data.extraction_prompt } : {}),
        ...(n.data.source_file_variable ? { source_file_variable: n.data.source_file_variable } : {}),
        ...(n.data.output_key ? { output_key: n.data.output_key } : {}),
        ...(n.data.field_permissions && Object.keys(n.data.field_permissions).length > 0 ? { field_permissions: n.data.field_permissions } : {}),
      },
      timeout_seconds: n.data.timeout_seconds || null,
      timeout_action: n.data.timeout_action || "none",
      retry_count: n.data.retry_count || null,
      retry_delay: n.data.retry_delay || null,
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
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [showSimulate, setShowSimulate] = useState(false);
  const [mockContextStr, setMockContextStr] = useState("{\n  \"requester\": \"Ali\",\n  \"amount\": 50000\n}");
  const [simulateLoading, setSimulateLoading] = useState(false);
  const [traces, setTraces] = useState([]);

  // Load
  useEffect(() => {
    (async () => {
      try {
        const w = await api.get(`/workflows/${id}`);
        setWf(w.data);
        const rf = toRF(w.data);
        setNodes(rf.nodes);
        setEdges(rf.edges);
        const [fRes, uRes] = await Promise.all([
          api.get("/forms"),
          api.get("/users").catch(() => ({ data: [] }))
        ]);
        setForms(fRes.data);
        setUsers(uRes.data);
      } catch {
        toast.error("فرایند یافت نشد");
        nav("/admin/workflows");
      }
    })();
  }, [id, nav]);

  // Handlers
  const onNodesChange = useCallback((c) => setNodes((nds) => applyNodeChanges(c, nds)), []);
  const onEdgesChange = useCallback((c) => setEdges((eds) => applyEdgeChanges(c, eds)), []);
  const onConnect = useCallback(
    (conn) => setEdges((eds) => addEdge({
      ...conn,
      id: `e_${Date.now()}`,
      type: "step",
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
      id, type: (nodeType === "ai_task" || nodeType === "ocr_task") ? nodeType : "custom", position: pos,
      data: { label: NODE_TYPES_META[nodeType].label, nodeType },
    }]);
  };

  const onLayout = useCallback(() => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({ rankdir: 'LR', align: 'UL', ranksep: 260, nodesep: 160 });

    nodes.forEach((node) => {
      dagreGraph.setNode(node.id, { width: 220, height: 100 });
    });
    edges.forEach((edge) => {
      dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const layoutedNodes = nodes.map((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);
      return {
        ...node,
        targetPosition: Position.Left,
        sourcePosition: Position.Right,
        position: {
          x: nodeWithPosition.x - 110,
          y: nodeWithPosition.y - 50,
        }
      };
    });

    setNodes(layoutedNodes);
    setTimeout(() => { saveSilently(layoutedNodes, edges); }, 100);
  }, [nodes, edges, saveSilently]);

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
      const cronNode = nodes.find(n => n.data.nodeType === "cron");
      if (cronNode) {
          payload.trigger_type = "cron";
          payload.cron_expression = cronNode.data.cron_expression || "0 0 * * *";
      } else {
          payload.trigger_type = "manual";
          payload.cron_expression = null;
      }
      await api.patch(`/workflows/${id}`, payload);
      toast.success("ذخیره شد");
    } catch { toast.error("خطا در ذخیره"); }
    finally { setSaving(false); }
  };

  const publish = async () => {
    const payload = { ...fromRF(nodes, edges), status: "published" };
    const cronNode = nodes.find(n => n.data.nodeType === "cron");
    if (cronNode) {
        payload.trigger_type = "cron";
        payload.cron_expression = cronNode.data.cron_expression || "0 0 * * *";
    } else {
        payload.trigger_type = "manual";
        payload.cron_expression = null;
    }
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

  const runSimulation = async () => {
    try {
      setSimulateLoading(true);
      const payload = { mock_context: JSON.parse(mockContextStr) };
      await saveSilently();
      const res = await api.post(`/workflows/${id}/simulate`, payload);
      setTraces(res.data.traces);
      
      const traceNodeIds = res.data.traces.map(t => t.node_id).filter(Boolean);
      setEdges(eds => eds.map(e => {
        const sIdx = traceNodeIds.indexOf(e.source);
        const tIdx = traceNodeIds.indexOf(e.target);
        const isTraversed = sIdx !== -1 && tIdx !== -1 && sIdx < tIdx;
        return {
          ...e,
          animated: isTraversed,
          style: isTraversed ? { stroke: '#0d9488', strokeWidth: 2 } : { stroke: '#b5b5b5' },
        };
      }));
      toast.success("شبیه‌سازی با موفقیت انجام شد");
    } catch (e) {
      toast.error("خطا در شبیه‌سازی یا JSON نامعتبر");
    } finally {
      setSimulateLoading(false);
    }
  };

  const selectedNode = selected?.kind === "node" ? nodes.find(n => n.id === selected.id) : null;
  const selectedEdge = selected?.kind === "edge" ? edges.find(e => e.id === selected.id) : null;

  if (!wf) return <div className="p-10 text-sm text-muted-foreground">در حال بارگذاری…</div>;

  return (
    <div className="h-[calc(100vh-56px)] md:h-screen flex flex-col" data-testid="builder-root" data-tour-id="tour-workflow-canvas">
      {/* Topbar */}
      <div className="border-b border-border bg-card px-4 lg:px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/admin/workflows" className="text-muted-foreground hover:text-foreground">
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
          <Button data-testid="builder-simple-btn" variant="outline" size="sm" onClick={() => nav(`/admin/workflows/${id}/simple`)}>
            <List className="w-4 h-4 me-1" /> نمای خطی (ساده)
          </Button>
          <Button data-testid="builder-layout-btn" variant="outline" size="sm" onClick={onLayout}>
            <Wand2 className="w-4 h-4 me-1" /> چیدمان خودکار
          </Button>
          <Button data-testid="builder-ai-btn" variant="outline" size="sm" onClick={() => setAiOpen(true)}>
            <Sparkles className="w-4 h-4 me-1" /> هوش مصنوعی
          </Button>
          <Button data-testid="builder-simulate-btn" variant="outline" size="sm" onClick={() => setShowSimulate(true)}>
            <Activity className="w-4 h-4 me-1" /> دیباگ و شبیه‌سازی
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
        <div className="hidden lg:flex w-56 border-l border-border bg-card p-3 flex-col gap-2" data-testid="node-palette">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider px-1 mono">گره‌ها</div>
          {Object.entries(NODE_TYPES_META).map(([k, m]) => {
            const Icon = m.icon;
            return (
              <button
                key={k}
                data-testid={`palette-${k}`}
                onClick={() => addNode(k)}
                className="flex flex-col gap-1 px-3 py-2 rounded-lg border border-border hover:border-neutral-900 hover:bg-muted text-right transition-colors"
              >
                <div className="flex items-center gap-2 w-full">
                  <span className="w-1 h-4 rounded-sm flex-shrink-0" style={{ background: m.bar }} />
                  <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="flex-1 text-sm font-medium">{m.label}</span>
                  <Plus className="w-3.5 h-3.5 text-neutral-300 flex-shrink-0" />
                </div>
                {m.description && (
                  <div className="text-[11px] text-gray-400 leading-tight pr-6">
                    {m.description}
                  </div>
                )}
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
            defaultEdgeOptions={{ type: 'step' }}
            fitView
            fitViewOptions={{ padding: 0.25 }}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={24} size={1.2} color="#d4d4d4" />
            <Controls position="bottom-left" />
            <MiniMap pannable zoomable className="!bg-card !border !border-border !rounded-lg" />
          </ReactFlow>

          {/* Mobile floating palette */}
          <div className="lg:hidden absolute bottom-4 right-4 flex flex-wrap gap-2 max-w-[80%] justify-end">
            {Object.entries(NODE_TYPES_META).map(([k, m]) => (
              <button
                key={k}
                data-testid={`m-palette-${k}`}
                onClick={() => addNode(k)}
                className="text-xs px-2.5 py-1.5 rounded-md bg-card border border-border hover:bg-muted"
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
          edges={edges}
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

      {showSimulate && (
        <SimulationPanel
          onClose={() => {
            setShowSimulate(false);
            setEdges(eds => eds.map(e => ({ ...e, animated: false, style: {} })));
          }}
          mockContextStr={mockContextStr}
          setMockContextStr={setMockContextStr}
          runSimulation={runSimulation}
          loading={simulateLoading}
          traces={traces}
        />
      )}
    </div>
  );
}

function SimulationPanel({ onClose, mockContextStr, setMockContextStr, runSimulation, loading, traces }) {
  const [expanded, setExpanded] = useState({});
  const toggle = (i) => setExpanded(p => ({...p, [i]: !p[i]}));

  return (
    <div className="absolute top-14 left-0 w-80 lg:w-96 h-[calc(100%-56px)] bg-card border-r border-border z-50 flex flex-col shadow-[10px_0_15px_-3px_rgba(0,0,0,0.1)]">
      <div className="p-4 border-b border-border flex items-center justify-between bg-muted/50">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Bug className="w-4 h-4 text-purple-600" /> حالت دیباگ (شبیه‌سازی)
        </h3>
        <button onClick={onClose} className="p-1 hover:bg-neutral-200 rounded text-muted-foreground"><X className="w-4 h-4" /></button>
      </div>
      
      <div className="p-4 flex-1 overflow-y-auto flex flex-col gap-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">داده‌های ورودی (Mock Context JSON)</label>
          <Textarea 
            dir="ltr"
            className="text-[11px] font-mono bg-primary text-teal-400 focus-visible:ring-purple-500 border-0 shadow-inner"
            rows={6}
            value={mockContextStr}
            onChange={e => setMockContextStr(e.target.value)}
          />
        </div>
        
        <Button onClick={runSimulation} disabled={loading} className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-md">
          {loading ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <PlayCircle className="w-4 h-4 me-2" />}
          اجرای شبیه‌سازی در لحظه
        </Button>
        
        {traces && traces.length > 0 && (
          <div className="mt-2 border-t border-neutral-100 pt-4">
            <h4 className="text-sm font-semibold mb-3 flex items-center justify-between">
              لاگ‌های اجرا
              <span className="text-[10px] bg-muted px-2 py-0.5 rounded text-muted-foreground font-mono">
                {traces.reduce((acc, t) => acc + (t.time_taken_ms || 0), 0)}ms
              </span>
            </h4>
            <div className="space-y-3">
              {traces.map((t, i) => (
                <div key={i} className={`border ${t.status === 'success' ? 'border-border' : 'border-red-200'} rounded-md bg-muted overflow-hidden`}>
                  <div className="p-2.5 flex items-center justify-between bg-card cursor-pointer hover:bg-muted transition-colors" onClick={() => toggle(i)}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`flex-shrink-0 w-2 h-2 rounded-full ${t.status === 'success' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'}`} />
                      <span className="text-xs font-semibold text-foreground truncate" dir="ltr">{t.node_id?.substring(0,8) || "SYSTEM"}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[10px] text-muted-foreground mono bg-muted px-1.5 py-0.5 rounded">⏱ {t.time_taken_ms}ms</span>
                      {expanded[i] ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                    </div>
                  </div>
                  {expanded[i] && (
                    <div className="p-3 border-t border-neutral-100 bg-primary overflow-auto max-h-48" dir="ltr">
                      <div className="text-[10px] text-muted-foreground mb-1">Result:</div>
                      <pre className="text-[11px] text-teal-400 font-mono leading-tight">{JSON.stringify(t.result, null, 2)}</pre>
                      
                      <div className="text-[10px] text-muted-foreground mt-3 mb-1">Context Snapshot:</div>
                      <pre className="text-[10px] text-purple-300 font-mono leading-tight">{JSON.stringify(t.context_snapshot, null, 2)}</pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function Inspector({ selectedNode, selectedEdge, forms, nodes, edges, onNode, onEdge, onDeleteNode, onDeleteEdge, workflowId }) {
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
                        {users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name} ({u.role})</SelectItem>)}
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
      <div className="bg-card rounded-xl border border-border w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            <div className="text-sm font-semibold">ساخت با هوش مصنوعی</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted"><X className="w-4 h-4" /></button>
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
            <Button data-testid="ai-panel-send" disabled={streaming} onClick={send} className="bg-primary text-primary-foreground">
              {streaming ? (<><Loader2 className="w-4 h-4 me-1 animate-spin" /> در حال تولید…</>) : "تولید فرایند"}
            </Button>
          </div>
          {text && (
            <div className="mt-5 bg-muted border border-neutral-100 rounded-lg p-3 text-sm leading-7 text-muted-foreground whitespace-pre-wrap">
              {text.replace(/```json[\s\S]*?```/g, "").trim()}
            </div>
          )}
          {wf?.nodes && (
            <div className="mt-3 border border-border rounded-lg p-3">
              <div className="text-xs text-muted-foreground mb-2">پیش‌نمایش گره‌ها: <span className="fa-nums">{wf.nodes.length}</span></div>
              <div className="flex flex-wrap gap-2">
                {wf.nodes.map((n) => (
                  <div key={n.id} className="text-[11px] border border-border rounded-md px-2 py-1">
                    <span className="text-muted-foreground mono me-1">{n.type}</span> {n.label}
                  </div>
                ))}
              </div>
              <div className="mt-3 flex justify-end">
                <Button data-testid="ai-panel-apply" onClick={() => onApply(wf)} className="bg-primary text-primary-foreground">
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
