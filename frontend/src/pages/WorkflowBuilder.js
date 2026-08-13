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

import { useWorkflowManager } from "@/hooks/useWorkflowManager";
import { Inspector } from "@/components/workflow/Inspector";
import { NODE_TYPES_META, getNodeMeta, toRF } from "@/lib/workflowUtils";
// Custom node renderer (monochromatic, top colored bar by type)
function FlowNode({ data, selected, id }) {
  const meta = getNodeMeta(data.nodeType);
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


export default function WorkflowBuilder() {
  const { id } = useParams();
  const nav = useNavigate();
  const {
    wf, setWf,
    nodes, setNodes,
    edges, setEdges,
    selected, setSelected,
    forms, users, saving,
    saveSilently, updateNode, deleteNode, updateEdge, deleteEdge,
    save, publish, startInstance
  } = useWorkflowManager(id);

  const [aiOpen, setAiOpen] = useState(false);
  
  const [showSimulate, setShowSimulate] = useState(false);
  const [mockContextStr, setMockContextStr] = useState(`{
  "requester": "Ali",
  "amount": 50000
}`);
  const [simulateLoading, setSimulateLoading] = useState(false);
  const [traces, setTraces] = useState([]);

  // Handlers
  const onNodesChange = useCallback((c) => setNodes((nds) => applyNodeChanges(c, nds)), [setNodes]);
  const onEdgesChange = useCallback((c) => setEdges((eds) => applyEdgeChanges(c, eds)), [setEdges]);
  const onConnect = useCallback(
    (conn) => setEdges((eds) => addEdge({
      ...conn,
      id: `e_${Date.now()}`,
      type: "step",
      markerEnd: { type: MarkerType.ArrowClosed, color: "#525252" },
    }, eds)),
    [setEdges]
  );

  const onNodeDragStop = useCallback(() => {
    saveSilently(nodes, edges);
  }, [saveSilently, nodes, edges]);

  const addNode = (nodeType) => {
    const newId = `n_${Date.now()}`;
    const last = nodes[nodes.length - 1];
    const pos = last
      ? { x: (last.position?.x ?? 80) + 260, y: last.position?.y ?? 160 }
      : { x: 120, y: 160 };
    setNodes((n) => {
      const newNodes = [...n, {
        id: newId, type: (nodeType === "ai_task" || nodeType === "ocr_task") ? nodeType : "custom", position: pos,
        data: { label: NODE_TYPES_META[nodeType].label, nodeType },
      }];
      saveSilently(newNodes, edges);
      return newNodes;
    });
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
  }, [nodes, edges, saveSilently, setNodes]);

  const runSimulation = async () => {
    try {
      setSimulateLoading(true);
      const payload = { mock_context: JSON.parse(mockContextStr) };
      await saveSilently(nodes, edges);
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
          <Input
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
            if (!Icon) return null;
            return (
              <Button variant="ghost"
                key={k}
                data-testid={`palette-${k}`}
                onClick={() => addNode(k)}
                className="h-auto w-full flex flex-col items-stretch gap-1 px-3 py-2 rounded-lg border border-border hover:border-neutral-900 hover:bg-muted text-right whitespace-normal transition-colors"
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
              </Button>
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
              <Button variant="ghost"
                key={k}
                data-testid={`m-palette-${k}`}
                onClick={() => addNode(k)}
                className="h-auto text-xs px-2.5 py-1.5 rounded-md bg-card border border-border hover:bg-muted"
                style={{ direction: "rtl" }}
              >
                + {m.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Inspector */}
        <Inspector
          selectedNode={selectedNode}
          selectedEdge={selectedEdge}
          forms={forms}
          users={users}
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
        <Button variant="ghost" size="icon" onClick={onClose} className="p-1 hover:bg-neutral-200 rounded text-muted-foreground"><X className="w-4 h-4" /></Button>
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
          <Button variant="ghost" size="icon" onClick={onClose} className="p-1.5 rounded-md hover:bg-muted"><X className="w-4 h-4" /></Button>
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



