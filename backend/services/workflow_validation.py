"""Validation for AI-generated workflow JSON.

An LLM returns plausible-looking JSON, not necessarily JSON this product can
execute. Three things go wrong often enough to be worth guarding:

* node ``type`` values the process engine does not branch on, which produce a
  workflow that silently stalls at that node;
* ``assignee_role`` values no user can hold — the four-role vocabulary from
  ``frontend/src/lib/templates.js`` and the old docs still leaks into model
  output, while ``core.models.User.ROLE_CHOICES`` only has two;
* edges pointing at node ids that do not exist.

Rather than reject the whole thing (the user just watched it stream in), the
normaliser repairs what it safely can, drops what it cannot, and reports what
it changed so the caller can surface it.
"""

from __future__ import annotations

# Node types engine.py actually branches on. Anything else stalls a process.
VALID_NODE_TYPES = frozenset(
    {"trigger", "task", "approval", "condition", "form", "end", "ai_task", "ocr_task"}
)

# Must match core.models.User.ROLE_CHOICES. Imported rather than duplicated so
# that adding a role to the model cannot silently leave this list behind.
from core.models import User

VALID_ROLES = frozenset(value for value, _label in User.ROLE_CHOICES)

# Vocabulary the model tends to invent, plus the legacy four-role names, mapped
# onto roles that actually exist. Keeps a generated workflow assignable instead
# of routing tasks to a role nobody holds.
ROLE_ALIASES = {
    # Legacy four-role vocabulary
    "ادمین سازمان": "مدیر",
    "طراح فرایند": "مدیرکل تحول اداری",
    "مدیر تیم": "مدیر",
    "مدیر گروه": "مدیر",
    "کارشناس": "کارمند",
    "کاربر": "کارمند",
    "admin": "مدیر",
    "manager": "مدیر",
    "employee": "کارمند",
    "user": "کارمند",
    # Common phrasings of the organisational roles
    "متقاضی": "کارمند",
    "درخواست‌کننده": "کارمند",
    "درخواست کننده": "کارمند",
    "مدیر مافوق": "مدیر",
    "معاونت برنامه‌ریزی و توسعه مدیریت": "معاون برنامه‌ریزی و توسعه مدیریت",
    "معاون برنامه ریزی و توسعه مدیریت": "معاون برنامه‌ریزی و توسعه مدیریت",
    "رئیس مرکز ملی فضای مجازی": "رئیس مرکز",
    "مدیرکل پشتیبانی، تدارکات و امور قراردادها": "مدیرکل پشتیبانی و تدارکات",
    "مدیرکل پشتیبانی": "مدیرکل پشتیبانی و تدارکات",
    "مدیرکل تدارکات و پشتیبانی": "مدیرکل پشتیبانی و تدارکات",
    "مدیر پشتیبانی": "رئیس اداره پشتیبانی",
    "مدیرکل مالی اداری": "مدیرکل مالی و سرمایه انسانی",
    "مدیرکل مالی و سرمایه‌ی انسانی": "مدیرکل مالی و سرمایه انسانی",
    "مدیرکل فناوری اطلاعات و تحول دیجیتال": "مدیرکل فناوری اطلاعات",
    "مدیرکل تحول اداری و بهبود فرآیندها": "مدیرکل تحول اداری",
    "رئیس اداره تدارکات و امور قراردادها": "رئیس اداره تدارکات",
    "رئیس اداره حفاظت فناوری اطلاعات و اسناد": "رئیس اداره حفاظت فناوری اطلاعات",
    "اداره حراست": "مدیرکل حراست",
    "کارشناس تدارکات و انبار (انباردار)": "کارشناس تدارکات و انبار",
    "انباردار": "کارشناس تدارکات و انبار",
    "کارشناس خزانه": "کارشناس مالی",
    "کارشناس خزامه": "کارشناس مالی",  # typo in the پرداخت قرارداد document
    "کارشناس مالی (خزانه)": "کارشناس مالی",
    "اعضای کمیته فنی و بازرگانی": "کمیته فنی و بازرگانی",
    "دبیر کمیته فنی و بازرگانی": "رئیس اداره تدارکات",
    "کارشناس اداره سرمایه انسانی": "کارشناس سرمایه انسانی",
    "کارشناس فرآیند‌ها": "کارشناس فرآیندها",
    "کارشناس فرایندها": "کارشناس فرآیندها",
}

NODE_SPACING_X = 260


def normalize_workflow(raw) -> tuple[dict | None, list[str]]:
    """Coerce model output into a workflow the engine can run.

    Returns ``(workflow_or_None, warnings)``. ``None`` means the payload was
    too malformed to repair — the caller should treat it as "no workflow was
    generated" rather than saving something broken.
    """
    warnings: list[str] = []

    if not isinstance(raw, dict):
        return None, ["پاسخ مدل یک شیء JSON معتبر نبود."]

    raw_nodes = raw.get("nodes")
    if not isinstance(raw_nodes, list) or not raw_nodes:
        return None, ["فرایند تولیدشده هیچ گره‌ای نداشت."]

    nodes: list[dict] = []
    seen_ids: set[str] = set()

    for index, node in enumerate(raw_nodes):
        if not isinstance(node, dict):
            warnings.append(f"گره شماره {index + 1} نامعتبر بود و حذف شد.")
            continue

        node_id = str(node.get("id") or "").strip() or f"n{index + 1}"
        if node_id in seen_ids:
            # Duplicate ids make edges ambiguous; the engine looks nodes up by
            # id, so a later duplicate would shadow an earlier node.
            node_id = f"{node_id}-{index + 1}"
            warnings.append(f"شناسه تکراری گره اصلاح شد: {node_id}")
        seen_ids.add(node_id)

        node_type = str(node.get("type") or "").strip()
        if node_type not in VALID_NODE_TYPES:
            warnings.append(
                f"نوع گره «{node_type or 'نامشخص'}» پشتیبانی نمی‌شود؛ به «task» تبدیل شد."
            )
            node_type = "task"

        data = node.get("data")
        data = dict(data) if isinstance(data, dict) else {}

        role = data.get("assignee_role")
        if role is not None:
            role = str(role).strip()
            if role not in VALID_ROLES:
                mapped = ROLE_ALIASES.get(role)
                if mapped:
                    warnings.append(f"نقش «{role}» به «{mapped}» تبدیل شد.")
                    data["assignee_role"] = mapped
                else:
                    warnings.append(f"نقش «{role}» شناخته نشد؛ به «کارمند» تغییر کرد.")
                    data["assignee_role"] = "کارمند"

        label = str(node.get("label") or data.get("label") or "").strip()
        if not label:
            label = node_id
        # The builder reads the label from data.label and the engine from the
        # top level, so both have to carry it.
        data["label"] = label

        position = node.get("position")
        if not (
            isinstance(position, dict)
            and isinstance(position.get("x"), (int, float))
            and isinstance(position.get("y"), (int, float))
        ):
            position = {"x": 80 + len(nodes) * NODE_SPACING_X, "y": 120}

        nodes.append(
            {
                "id": node_id,
                "type": node_type,
                "label": label,
                "position": position,
                "data": data,
            }
        )

    if not nodes:
        return None, warnings + ["هیچ گره معتبری در پاسخ مدل نبود."]

    node_ids = {n["id"] for n in nodes}
    edges: list[dict] = []
    seen_edges: set[tuple[str, str]] = set()

    for index, edge in enumerate(raw.get("edges") or []):
        if not isinstance(edge, dict):
            continue
        source = str(edge.get("source") or "").strip()
        target = str(edge.get("target") or "").strip()
        if source not in node_ids or target not in node_ids:
            warnings.append(f"یال {source or '?'}→{target or '?'} به گره ناموجود اشاره داشت و حذف شد.")
            continue
        if (source, target) in seen_edges:
            continue
        seen_edges.add((source, target))

        new_edge = {
            "id": str(edge.get("id") or "").strip() or f"e{index + 1}",
            "source": source,
            "target": target,
        }
        if isinstance(edge.get("condition"), dict):
            new_edge["condition"] = edge["condition"]
        edges.append(new_edge)

    if not edges and len(nodes) > 1:
        # A disconnected graph never advances past the trigger. Chaining in the
        # given order matches the linear shape the prompt asks for and is a
        # better starting point for the builder than an inert set of nodes.
        warnings.append("یال‌ها نامعتبر بودند؛ گره‌ها به‌صورت خطی به هم وصل شدند.")
        edges = [
            {"id": f"e{i + 1}", "source": nodes[i]["id"], "target": nodes[i + 1]["id"]}
            for i in range(len(nodes) - 1)
        ]

    name = str(raw.get("name") or "").strip() or "فرایند بدون نام"
    description = str(raw.get("description") or "").strip()

    return {"name": name, "description": description, "nodes": nodes, "edges": edges}, warnings
