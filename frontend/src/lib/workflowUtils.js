
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
