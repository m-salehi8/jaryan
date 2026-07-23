import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import {
  PlayCircle, Save, Trash2, Plus, ArrowRight,
  Zap, Clock, LayoutTemplate
} from "lucide-react";
import { MarkerType } from "reactflow";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NODE_TYPES_META, toRF, fromRF, Inspector } from "./WorkflowBuilder";

export default function SimpleWorkflowBuilder() {
  const { id } = useParams();
  const nav = useNavigate();
  const [wf, setWf] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selected, setSelected] = useState(null); // node or edge id
  const [forms, setForms] = useState([]);
  const [users, setUsers] = useState([]);
  const [saving, setSaving] = useState(false);

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

  const saveSilently = async (latestNodes, latestEdges) => {
    try {
      const payload = fromRF(latestNodes ?? nodes, latestEdges ?? edges);
      const cronNode = (latestNodes ?? nodes).find(n => n.data.nodeType === "cron");
      if (cronNode) {
          payload.trigger_type = "cron";
          payload.cron_expression = cronNode.data.cron_expression || "0 0 * * *";
      } else {
          payload.trigger_type = "manual";
          payload.cron_expression = null;
      }
      await api.patch(`/workflows/${id}`, payload);
    } catch (e) { /* swallow background save errors */ }
  };

  const updateNode = (nodeId, patch) => {
    setNodes((nds) => {
      const newNodes = nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n);
      saveSilently(newNodes, edges);
      return newNodes;
    });
  };

  const deleteNode = (nodeId) => {
    setNodes((nds) => {
      const newNodes = nds.filter(n => n.id !== nodeId);
      setEdges((eds) => {
        const newEdges = eds.filter(e => e.source !== nodeId && e.target !== nodeId);
        saveSilently(newNodes, newEdges);
        return newEdges;
      });
      return newNodes;
    });
    setSelected(null);
  };

  const updateEdge = (edgeId, patch) => {
    setEdges((eds) => {
      const newEdges = eds.map((e) => e.id === edgeId ? { ...e, ...patch, data: { ...e.data, ...(patch.data || {}) } } : e);
      saveSilently(nodes, newEdges);
      return newEdges;
    });
  };
  
  const deleteEdge = (edgeId) => {
    setEdges((eds) => {
      const newEdges = eds.filter(e => e.id !== edgeId);
      saveSilently(nodes, newEdges);
      return newEdges;
    });
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

  // Build the sorted timeline
  const sortedNodes = React.useMemo(() => {
    const sorted = [];
    const visited = new Set();
    
    // Find start nodes
    let currentNodes = nodes.filter(n => !edges.some(e => e.target === n.id));
    if (currentNodes.length === 0 && nodes.length > 0) {
      currentNodes = [nodes.find(n => n.data.nodeType === "trigger" || n.data.nodeType === "cron") || nodes[0]];
    }

    while (currentNodes.length > 0) {
      const nextNodes = [];
      for (const node of currentNodes) {
        if (!visited.has(node.id)) {
          sorted.push(node);
          visited.add(node.id);
          const childrenEdges = edges.filter(e => e.source === node.id);
          const children = childrenEdges.map(e => nodes.find(n => n.id === e.target)).filter(Boolean);
          nextNodes.push(...children);
        }
      }
      currentNodes = nextNodes;
    }
    
    // Add any disconnected nodes
    for (const node of nodes) {
      if (!visited.has(node.id)) {
        sorted.push(node);
      }
    }
    return sorted;
  }, [nodes, edges]);

  // Insert a node after a specific node
  const insertNodeAfter = (sourceNodeId, nodeType) => {
    const id = `n_${Date.now()}`;
    const sourceNode = nodes.find(n => n.id === sourceNodeId);
    
    // Calculate new position
    const pos = sourceNode ? { x: sourceNode.position.x, y: sourceNode.position.y + 150 } : { x: 120, y: 160 };

    // Create the new node
    const newNode = {
      id,
      type: (nodeType === "ai_task" || nodeType === "ocr_task") ? nodeType : "custom",
      position: pos,
      data: { label: NODE_TYPES_META[nodeType].label, nodeType },
    };

    // Re-route existing edge if any
    const existingEdges = edges.filter(e => e.source === sourceNodeId);
    let newEdges = [...edges];
    
    if (existingEdges.length > 0) {
      const oldEdge = existingEdges[0];
      newEdges = newEdges.filter(e => e.id !== oldEdge.id);
      
      newEdges.push({
        id: `e_${Date.now()}_1`,
        source: sourceNodeId,
        target: newNode.id,
        label: "",
        type: "step",
        markerEnd: { type: MarkerType.ArrowClosed, color: "#525252" },
        data: { condition: null }
      });
      newEdges.push({
        id: `e_${Date.now()}_2`,
        source: newNode.id,
        target: oldEdge.target,
        label: oldEdge.label || "",
        type: "step",
        markerEnd: { type: MarkerType.ArrowClosed, color: "#525252" },
        data: oldEdge.data || {}
      });
    } else {
      newEdges.push({
        id: `e_${Date.now()}_1`,
        source: sourceNodeId,
        target: newNode.id,
        label: "",
        type: "step",
        markerEnd: { type: MarkerType.ArrowClosed, color: "#525252" },
        data: { condition: null }
      });
    }

    // Shift down all nodes below the new node
    const shiftY = 150;
    const updatedNodes = nodes.map(n => {
      if (sourceNode && n.position.y > sourceNode.position.y) {
        return { ...n, position: { ...n.position, y: n.position.y + shiftY } };
      }
      return n;
    });

    const finalNodes = [...updatedNodes, newNode];
    setNodes(finalNodes);
    setEdges(newEdges);
    saveSilently(finalNodes, newEdges);
    setSelected({ kind: "node", id: newNode.id });
  };

  const addStartNode = (nodeType) => {
    const id = `n_${Date.now()}`;
    const newNode = {
      id, type: "custom", position: { x: 120, y: 160 },
      data: { label: NODE_TYPES_META[nodeType].label, nodeType },
    };
    const finalNodes = [newNode];
    setNodes(finalNodes);
    saveSilently(finalNodes, edges);
    setSelected({ kind: "node", id: newNode.id });
  };

  const selectedNode = selected?.kind === "node" ? nodes.find(n => n.id === selected.id) : null;
  const selectedEdge = selected?.kind === "edge" ? edges.find(e => e.id === selected.id) : null;

  if (!wf) return <div className="p-10 text-sm text-muted-foreground">در حال بارگذاری…</div>;

  return (
    <div className="h-[calc(100vh-56px)] md:h-screen flex flex-col bg-muted" data-testid="simple-builder-root" dir="rtl">
      {/* Topbar */}
      <div className="border-b border-border bg-card px-4 lg:px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/admin/workflows" className="text-muted-foreground hover:text-foreground">
            <ArrowRight className="w-4 h-4" />
          </Link>
          <input
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
          <Button variant="outline" size="sm" onClick={() => nav(`/admin/workflows/${id}`)}>
            <LayoutTemplate className="w-4 h-4 me-1" /> نمای بوم (پیشرفته)
          </Button>
          <Button variant="outline" size="sm" onClick={save} disabled={saving}>
            <Save className="w-4 h-4 me-1" /> ذخیره
          </Button>
          <Button size="sm" className="bg-brand hover:bg-brand-strong text-white font-semibold" onClick={publish}>
            انتشار
          </Button>
          <Button
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
        {/* Timeline View */}
        <div className="flex-1 overflow-y-auto p-8 flex justify-center">
          <div className="w-full max-w-2xl flex flex-col items-center">
            {sortedNodes.length === 0 ? (
              <div className="text-center p-12 bg-card border border-border border-dashed rounded-xl w-full">
                <div className="text-muted-foreground mb-4">هیچ گره‌ای وجود ندارد. برای شروع یک گره آغازین اضافه کنید.</div>
                <div className="flex justify-center gap-2">
                  <Button onClick={() => addStartNode("trigger")} variant="outline"><Zap className="w-4 h-4 me-2"/> شروع دستی</Button>
                  <Button onClick={() => addStartNode("cron")} variant="outline"><Clock className="w-4 h-4 me-2"/> شروع زمان‌دار</Button>
                </div>
              </div>
            ) : (
              sortedNodes.map((node, index) => {
                const meta = NODE_TYPES_META[node.data.nodeType] || NODE_TYPES_META.task;
                const Icon = meta.icon;
                const isSelected = selected?.id === node.id;
                
                return (
                  <React.Fragment key={node.id}>
                    {/* Node Card */}
                    <div 
                      className={`w-full bg-card rounded-xl border-2 transition-all cursor-pointer overflow-hidden ${isSelected ? "border-brand shadow-md" : "border-border shadow-sm hover:border-border"}`}
                      onClick={() => setSelected({ kind: "node", id: node.id })}
                    >
                      <div className="h-1.5 w-full" style={{ background: meta.bar }} />
                      <div className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-muted border border-neutral-100 flex items-center justify-center flex-shrink-0">
                            <Icon className="w-5 h-5 text-muted-foreground" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] text-muted-foreground mono uppercase px-1.5 py-0.5 rounded bg-muted">{meta.label}</span>
                              {node.data.assignee_role && (
                                <span className="text-[10px] text-brand-strong bg-brand-light px-1.5 py-0.5 rounded">{node.data.assignee_role}</span>
                              )}
                            </div>
                            <div className="font-semibold text-foreground">{node.data.label}</div>
                            {node.data.system_prompt && <div className="text-xs text-muted-foreground mt-1 truncate max-w-sm" dir="ltr">Prompt: {node.data.system_prompt}</div>}
                            {node.data.output_key && <div className="text-xs text-muted-foreground truncate max-w-sm" dir="ltr">Output Key: {node.data.output_key}</div>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            onClick={(e) => { e.stopPropagation(); deleteNode(node.id); }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Inline Quick Add Button */}
                    <div className="h-12 flex items-center justify-center relative w-full">
                      <div className="absolute top-0 bottom-0 w-px bg-neutral-300" />
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="relative z-10 w-6 h-6 rounded-full bg-card border border-border shadow-sm flex items-center justify-center text-muted-foreground hover:text-brand hover:border-brand hover:scale-110 transition-all">
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-2 bg-card" side="right" align="center">
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider px-2 mb-2 mono">افزودن گره جدید</div>
                          <div className="grid grid-cols-1 gap-1">
                            {Object.entries(NODE_TYPES_META).filter(([k]) => !['trigger', 'cron'].includes(k)).map(([k, m]) => {
                              const MIcon = m.icon;
                              return (
                                <button
                                  key={k}
                                  onClick={() => {
                                    insertNodeAfter(node.id, k);
                                  }}
                                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-right transition-colors"
                                >
                                  <MIcon className="w-4 h-4 text-muted-foreground" />
                                  <span className="text-sm font-medium">{m.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </React.Fragment>
                );
              })
            )}
            
            {/* End Marker (Visual only) */}
            {sortedNodes.length > 0 && (
              <div className="w-4 h-4 rounded-full bg-neutral-200 border-2 border-white shadow-sm ring-1 ring-neutral-300 z-10" />
            )}
          </div>
        </div>

        {/* Inspector Sidebar */}
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
    </div>
  );
}
