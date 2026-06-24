// Pure-JS evaluator for VisibilityRule — mirrors backend engine.py

const coerceNum = (a, b) => {
  const na = Number(a), nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && a !== "" && b !== "") return [na, nb];
  return [String(a ?? ""), String(b ?? "")];
};

export function evaluateRule(rule, context) {
  if (!rule) return true;

  // Group rule
  if (rule.combinator && Array.isArray(rule.conditions)) {
    if (rule.conditions.length === 0) return true;
    if (rule.combinator === "or") return rule.conditions.some(c => evaluateRule(c, context));
    return rule.conditions.every(c => evaluateRule(c, context));
  }

  if (!rule.field_id) return true;
  const op = rule.op || "=";
  const target = rule.value ?? "";
  const actual = context?.[rule.field_id];

  if (op === "empty") return actual === undefined || actual === null || actual === "" || (Array.isArray(actual) && actual.length === 0);
  if (op === "not_empty") return !(actual === undefined || actual === null || actual === "" || (Array.isArray(actual) && actual.length === 0));

  const [a, b] = coerceNum(actual, target);
  switch (op) {
    case "=":  return a === b;
    case "!=": return a !== b;
    case ">":  return a > b;
    case "<":  return a < b;
    case ">=": return a >= b;
    case "<=": return a <= b;
    case "contains": return String(actual ?? "").includes(String(target ?? ""));
    default:   return false;
  }
}

export const OP_LABELS = {
  "=":  "برابر است با",
  "!=": "نابرابر است با",
  ">":  "بزرگ‌تر است از",
  "<":  "کوچک‌تر است از",
  ">=": "بزرگ‌تر یا مساوی",
  "<=": "کوچک‌تر یا مساوی",
  "contains": "شامل است",
  "empty": "خالی است",
  "not_empty": "پر است",
};

/** Compute which children belong to a tab parent given the active tab id. */
export function childrenOfTab(fields, parent_field_id, parent_tab_id) {
  return fields.filter(f => f.parent_tab_field_id === parent_field_id && f.parent_tab_id === parent_tab_id);
}

export function topLevelFields(fields) {
  return fields.filter(f => !f.parent_tab_field_id);
}
