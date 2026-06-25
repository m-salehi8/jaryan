export function getSLAStatus(deadline, status) {
  if (!deadline) return null;
  if (["done", "approved", "rejected"].includes(status)) return null;
  const now = Date.now();
  const dl = new Date(deadline).getTime();
  const diff = dl - now;
  if (diff < 0) return "overdue";
  if (diff < 86400 * 1000) return "urgent";
  return null;
}

export const SLA_BADGE = {
  overdue: { label: "دیرکرد", cls: "bg-red-50 text-red-700 border border-red-200" },
  urgent: { label: "فوری", cls: "bg-amber-50 text-amber-700 border border-amber-200" },
};
