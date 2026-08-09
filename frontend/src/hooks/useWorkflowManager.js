import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { fromRF, toRF } from "@/lib/workflowUtils";

export function useWorkflowManager(id) {
  const nav = useNavigate();
  const [wf, setWf] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selected, setSelected] = useState(null);
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

  const saveSilently = useCallback(async (latestNodes, latestEdges) => {
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
  }, [id, nodes, edges]);

  const updateNode = useCallback((nodeId, patch) => {
    setNodes((nds) => {
      const newNodes = nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n);
      saveSilently(newNodes, edges);
      return newNodes;
    });
  }, [edges, saveSilently]);

  const deleteNode = useCallback((nodeId) => {
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
  }, [saveSilently]);

  const updateEdge = useCallback((edgeId, patch) => {
    setEdges((eds) => {
      const newEdges = eds.map((e) => e.id === edgeId ? { ...e, ...patch, data: { ...e.data, ...(patch.data || {}) } } : e);
      saveSilently(nodes, newEdges);
      return newEdges;
    });
  }, [nodes, saveSilently]);

  const deleteEdge = useCallback((edgeId) => {
    setEdges((eds) => {
      const newEdges = eds.filter(e => e.id !== edgeId);
      saveSilently(nodes, newEdges);
      return newEdges;
    });
    setSelected(null);
  }, [nodes, saveSilently]);

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
    if (wf?.status !== "published") {
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

  return {
    wf, setWf,
    nodes, setNodes,
    edges, setEdges,
    selected, setSelected,
    forms, users, saving,
    saveSilently, updateNode, deleteNode, updateEdge, deleteEdge,
    save, publish, startInstance
  };
}
