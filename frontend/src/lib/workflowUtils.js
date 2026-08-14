
import {
  Bot, CheckCircle2, CircleStop, Clock, Code2, FileText,
  GitBranch, PlayCircle, ScanText, Settings2, UserCheck, Webhook, Zap,
} from "lucide-react";

export const NODE_TYPES_META = {
  trigger: { label: "شروع (دستی)", description: "شروع دستی فرآیند" },
  cron: { label: "شروع (زمان‌بندی)", description: "شروع زمان‌بندی شده" },
  task: { label: "وظیفه انسانی", description: "وظیفه قابل انجام توسط انسان" },
  ai_task: { label: "هوش مصنوعی", description: "گره پردازش هوش مصنوعی" },
  ocr_task: { label: "پردازش تصویر (OCR)", description: "استخراج متن از تصویر" },
  custom: { label: "سفارشی", description: "گره سفارشی" },
  condition: { label: "شرط", description: "شاخه شرطی" },
  webhook: { label: "وب‌هوک", description: "ارسال درخواست وب‌هوک" },
  script: { label: "اسکریپت", description: "اجرای کد سفارشی" },
};

Object.assign(NODE_TYPES_META, {
  form: { label: "فرم", description: "دریافت اطلاعات از کاربر" },
  approval: { label: "تأیید", description: "تأیید یا رد توسط مسئول" },
  end: { label: "پایان", description: "پایان فرایند" },
});

const NODE_VISUALS = {
  trigger: { icon: PlayCircle, bar: "#10b981" },
  cron: { icon: Clock, bar: "#0ea5e9" },
  task: { icon: UserCheck, bar: "#6366f1" },
  ai_task: { icon: Bot, bar: "#8b5cf6" },
  ocr_task: { icon: ScanText, bar: "#14b8a6" },
  custom: { icon: Settings2, bar: "#64748b" },
  condition: { icon: GitBranch, bar: "#f59e0b" },
  webhook: { icon: Webhook, bar: "#ec4899" },
  script: { icon: Code2, bar: "#334155" },
  form: { icon: FileText, bar: "#06b6d4" },
  approval: { icon: CheckCircle2, bar: "#22c55e" },
  end: { icon: CircleStop, bar: "#ef4444" },
};

Object.entries(NODE_VISUALS).forEach(([type, visual]) => {
  Object.assign(NODE_TYPES_META[type], visual);
});

export function getNodeMeta(type) {
  return NODE_TYPES_META[type] || {
    ...NODE_TYPES_META.custom,
    icon: Zap,
  };
}

export function toRF(wf) {
   if (!wf) return { nodes: [], edges: [] };
  return {
    nodes: wf.nodes || [],
    edges: wf.edges || [],
  };
}

export function fromRF(nodes, edges) {
  return {
    nodes: nodes || [],
    edges: edges || [],
  };
}
