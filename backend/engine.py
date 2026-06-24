"""Process execution engine for Raahkar.

Evaluates outgoing edges from the current node, picks the next node(s),
creates the corresponding tasks, and updates the process instance.

Conditions are structured rules of the shape:
    { field_id: str, op: str, value: str }
Evaluated against process_instance.context (dict of submitted form data
keyed by field_id, plus a few synthetic keys like 'status' and 'requester').
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from db import db, new_id, now_iso


def _coerce(a: Any, b: Any):
    """Try numeric comparison if both look numeric, else fall back to string."""
    try:
        return float(a), float(b)
    except (TypeError, ValueError):
        return str(a), str(b)


def evaluate_rule(rule: Optional[dict], context: dict) -> bool:
    if not rule:
        return True  # default (unconditional) edge

    # Group rule (AND/OR)
    if rule.get("combinator") and isinstance(rule.get("conditions"), list):
        combinator = rule["combinator"]
        conditions = rule["conditions"] or []
        if not conditions:
            return True
        if combinator == "or":
            return any(evaluate_rule(c, context) for c in conditions)
        return all(evaluate_rule(c, context) for c in conditions)

    # Single-clause rule
    field_id = rule.get("field_id")
    if not field_id:
        return True
    op = rule.get("op", "=")
    target = rule.get("value", "")
    actual = context.get(field_id, "")

    if op == "empty":
        return actual in (None, "", [], {})
    if op == "not_empty":
        return actual not in (None, "", [], {})

    a, b = _coerce(actual, target)
    if op == "=":
        return a == b
    if op == "!=":
        return a != b
    if op == ">":
        return a > b
    if op == "<":
        return a < b
    if op == ">=":
        return a >= b
    if op == "<=":
        return a <= b
    if op == "contains":
        return str(target) in str(actual)
    return False


def _node_to_task(*, org: str, process: dict, workflow: dict, node: dict) -> Optional[dict]:
    """Build a Task document for a workflow node (returns None for non-actionable nodes)."""
    ntype = node.get("type")
    if ntype in ("trigger", "end", "condition"):
        return None

    data = node.get("data") or {}
    assignee_role = data.get("assignee_role")
    form_id = data.get("form_id")

    task_type = (
        "approval" if ntype == "approval"
        else "form" if ntype == "form"
        else "task"
    )

    return {
        "id": new_id(),
        "org_id": org,
        "process_id": process["id"],
        "workflow_id": workflow["id"],
        "workflow_name": workflow["name"],
        "node_id": node["id"],
        "title": f"{node.get('label', 'تسک')} — {workflow['name']}",
        "assignee_id": None,
        "assignee_role": assignee_role,
        "type": task_type,
        "status": "pending",
        "priority": "medium",
        "deadline": (datetime.now(timezone.utc) + timedelta(days=3)).isoformat(),
        "form_id": form_id,
        "form_data": {},
        "description": "",
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }


def _outgoing(edges: list[dict], node_id: str) -> list[dict]:
    return [e for e in edges if e.get("source") == node_id]


async def advance_process(*, process_id: str, completed_node_id: str, context_update: dict | None = None) -> dict:
    """After a task completes, traverse outgoing edges from the current node,
    pick branch(es) whose conditions are satisfied, create the next tasks,
    and update process state.

    Returns a summary dict (changes applied) for logging / UI.
    """
    process = await db.process_instances.find_one({"id": process_id}, {"_id": 0})
    if not process:
        return {"ok": False, "reason": "process_not_found"}
    workflow = await db.workflows.find_one({"id": process["workflow_id"]}, {"_id": 0})
    if not workflow:
        return {"ok": False, "reason": "workflow_not_found"}

    # Merge any new context data (form submission for a node)
    ctx = dict(process.get("context") or {})
    if context_update:
        ctx.update(context_update)

    next_tasks: list[dict] = []
    new_node_ids: list[str] = []
    visited: set[str] = set()
    frontier = [completed_node_id]

    nodes_by_id = {n["id"]: n for n in workflow.get("nodes", [])}
    edges = workflow.get("edges", [])

    while frontier:
        current_id = frontier.pop(0)
        if current_id in visited:
            continue
        visited.add(current_id)

        out_edges = _outgoing(edges, current_id)
        # Pick conditional first; if none match, pick default (no condition).
        conditional = [e for e in out_edges if e.get("condition")]
        defaults = [e for e in out_edges if not e.get("condition")]
        chosen: list[dict] = [e for e in conditional if evaluate_rule(e.get("condition"), ctx)]
        if not chosen and defaults:
            chosen = defaults

        for edge in chosen:
            target_id = edge["target"]
            target_node = nodes_by_id.get(target_id)
            if not target_node:
                continue
            ttype = target_node.get("type")
            if ttype == "end":
                new_node_ids.append(target_id)
                continue
            if ttype == "condition":
                # Pass-through node: keep traversing without creating a task.
                frontier.append(target_id)
                continue
            task = _node_to_task(org=process["org_id"], process=process, workflow=workflow, node=target_node)
            if task:
                next_tasks.append(task)
                new_node_ids.append(target_id)
            else:
                # trigger or other; just walk further
                frontier.append(target_id)

    # Persist new tasks
    if next_tasks:
        await db.tasks.insert_many([dict(t) for t in next_tasks])

    # Determine new process status
    target_types = [nodes_by_id[nid]["type"] for nid in new_node_ids if nid in nodes_by_id]
    has_end = any(t == "end" for t in target_types)
    has_action = bool(next_tasks)

    if has_action:
        new_current = next_tasks[0]["node_id"]
        new_status = "running"
    elif has_end:
        new_current = next((nid for nid in new_node_ids if nodes_by_id.get(nid, {}).get("type") == "end"), None)
        new_status = "completed"
    else:
        new_current = process.get("current_node_id")
        new_status = process.get("status", "running")

    await db.process_instances.update_one(
        {"id": process_id},
        {"$set": {
            "current_node_id": new_current,
            "status": new_status,
            "context": ctx,
            "updated_at": now_iso(),
        }},
    )

    return {
        "ok": True,
        "next_tasks": [{"id": t["id"], "title": t["title"], "node_id": t["node_id"]} for t in next_tasks],
        "status": new_status,
    }
