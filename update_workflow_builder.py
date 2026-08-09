import re

with open("/root/jaryan/frontend/src/pages/WorkflowBuilder.js", "r") as f:
    content = f.read()

# Remove NODE_TYPES_META, toRF, fromRF
content = re.sub(
    r"export const NODE_TYPES_META = \{.*?\n};\nconst ROLES = \[\"مدیر\", \"کارمند\"\];\n",
    "",
    content,
    flags=re.DOTALL
)

content = re.sub(
    r"// Convert workflow JSON ↔ reactflow nodes/edges\nexport function toRF\(wf\) \{.*?\}\nexport function fromRF\(nodes, edges\) \{.*?\}\n",
    "",
    content,
    flags=re.DOTALL
)

# Remove Inspector and EdgeRuleBuilder and AIPanel
content = re.sub(
    r"export function Inspector\(.*?\{.*?\}\nfunction EdgeRuleBuilder\(.*?\{.*?\}\n",
    "",
    content,
    flags=re.DOTALL
)

# Replace the inner body of WorkflowBuilder
body_replacement = """export default function WorkflowBuilder() {
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
  const [mockContextStr, setMockContextStr] = useState("{\\n  \\\"requester\\\": \\\"Ali\\\",\\n  \\\"amount\\\": 50000\\n}");
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

  if (!wf) return <div className="p-10 text-sm text-muted-foreground">در حال بارگذاری…</div>;"""

old_body = r"export default function WorkflowBuilder\(\) \{.*?if \(\!wf\) return <div className=\"p-10 text-sm text-muted-foreground\">در حال بارگذاری…</div>;"
content = re.sub(old_body, body_replacement, content, flags=re.DOTALL)

with open("/root/jaryan/frontend/src/pages/WorkflowBuilder.js", "w") as f:
    f.write(content)
