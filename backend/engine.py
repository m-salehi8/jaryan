"""Process execution engine for Jaryan (MongoDB).

Evaluates outgoing edges from the current node, picks the next node(s),
creates the corresponding tasks, and updates the process instance.

This module uses the same Motor/MongoDB layer as the rest of the app
(``db`` from ``db.py``) so workflows, users, departments, tasks and process
instances all live in one place.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional
import json
import logging
import re

from db import db, new_id, now_iso

logger = logging.getLogger("jaryan.engine")


def inject_variables(text: str, context: dict) -> str:
    if not text:
        return text

    def replacer(match):
        key_path = match.group(1).strip().split(".")
        val = context
        try:
            for k in key_path:
                if isinstance(val, dict):
                    val = val[k]
                else:
                    return ""
            return str(val) if val is not None else ""
        except (KeyError, TypeError):
            return ""

    return re.sub(r"\{\{([^}]+)\}\}", replacer, text)


async def _run_ai_node(*, node: dict, context: dict, process_id: str) -> tuple[str | None, Any]:
    """Execute an ai_task or ocr_task node and return ``(output_key, result)``."""
    from services.ai_service import ai_service

    data = node.get("data") or {}
    node_type = node.get("type")
    output_key = str(data.get("output_key") or "").strip()

    if not output_key:
        return None, None

    session_id = f"{process_id}:{node.get('id')}"

    try:
        if node_type == "ocr_task":
            source = inject_variables(str(data.get("source_file_variable") or ""), context).strip()
            prompt = inject_variables(str(data.get("extraction_prompt") or ""), context).strip()
            if not source:
                return output_key, {"_error": "source_file_missing"}
            result = await ai_service.extract_data_from_image(source, prompt)
        else:
            system_prompt = inject_variables(str(data.get("system_prompt") or ""), context).strip()
            if not system_prompt:
                return output_key, {"_error": "prompt_missing"}
            visible = {k: v for k, v in context.items() if not k.startswith("_")}
            result = await ai_service.ask_ai_json(
                session_id, system_prompt, json.dumps(visible, ensure_ascii=False)
            )
    except Exception as exc:
        logger.exception("AI node %s failed in process %s", node.get("id"), process_id)
        return output_key, {"_error": type(exc).__name__, "_detail": str(exc)[:200]}

    return output_key, result


def _coerce(a: Any, b: Any):
    try:
        return float(a), float(b)
    except (TypeError, ValueError):
        return str(a), str(b)


def evaluate_rule(rule: Optional[dict], context: dict) -> bool:
    if not rule:
        return True

    if rule.get("combinator") and isinstance(rule.get("conditions"), list):
        combinator = rule["combinator"]
        conditions = rule["conditions"] or []
        if not conditions:
            return True
        if combinator == "or":
            return any(evaluate_rule(c, context) for c in conditions)
        return all(evaluate_rule(c, context) for c in conditions)

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


# ---------- Mongo data access ----------
async def _get_workflow(workflow_id: str) -> Optional[dict]:
    return await db.workflows.find_one({"id": workflow_id}, {"_id": 0})


async def _get_user(user_id: str) -> Optional[dict]:
    return await db.users.find_one({"id": user_id}, {"_id": 0})


async def _get_department(dept_id: str) -> Optional[dict]:
    return await db.departments.find_one({"id": dept_id}, {"_id": 0})


async def _node_to_task_data(
    *, org: str, process: dict, workflow_id: str, workflow_name: str, node: dict
) -> Optional[dict]:
    """Build task document for a workflow node, or None if the node is not a task."""
    ntype = node.get("type")
    if ntype in ("trigger", "end", "condition", "ai_task", "ocr_task"):
        return None

    data = node.get("data") or {}
    assignee_type = data.get("assignee_type", "role")
    assignee_role = data.get("assignee_role")
    assignee_id = data.get("assignee_id")
    form_id = data.get("form_id")
    field_permissions = data.get("field_permissions") or {}

    resolved_assignee_id = None
    resolved_assignee_role = None

    if assignee_type == "role":
        resolved_assignee_role = assignee_role
    elif assignee_type == "specific_user":
        resolved_assignee_id = assignee_id
    elif assignee_type == "manager" and process.get("started_by"):
        starter = await _get_user(process["started_by"])
        if starter and starter.get("manager_id"):
            resolved_assignee_id = starter["manager_id"]
        else:
            resolved_assignee_role = "مدیر"
    elif assignee_type == "department_manager" and process.get("started_by"):
        starter = await _get_user(process["started_by"])
        if starter and starter.get("department_id"):
            dept = await _get_department(starter["department_id"])
            if dept and dept.get("manager_id"):
                resolved_assignee_id = dept["manager_id"]
            else:
                resolved_assignee_role = "مدیر"
        else:
            resolved_assignee_role = "مدیر"
    else:
        # Fallback: honour whatever the node carried.
        resolved_assignee_role = assignee_role
        resolved_assignee_id = assignee_id

    task_type = "approval" if ntype == "approval" else "form" if ntype == "form" else "task"

    timeout_seconds = node.get("timeout_seconds")
    if timeout_seconds:
        deadline = (datetime.now(timezone.utc) + timedelta(seconds=timeout_seconds)).isoformat()
    else:
        deadline = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()

    return {
        "id": new_id(),
        "org_id": org,
        "process_id": process["id"],
        "workflow_id": workflow_id,
        "workflow_name": workflow_name,
        "node_id": node["id"],
        "title": f"{node.get('label', 'تسک')} — {workflow_name}",
        "assignee_id": resolved_assignee_id,
        "assignee_role": resolved_assignee_role,
        "type": task_type,
        "status": "pending",
        "wait_conditions": [],
        "priority": "medium",
        "deadline": deadline,
        "seen_time": None,
        "done_time": None,
        "form_id": form_id,
        "form_data": {},
        "draft_data": {},
        "description": "",
        "field_permissions": field_permissions,
        "escalated": False,
        "attempt_number": 1,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }


def _outgoing(edges: list[dict], node_id: str) -> list[dict]:
    return [e for e in edges if e.get("source") == node_id]


async def update_process_status(process_id: str, org_id: str):
    process = await db.process_instances.find_one({"id": process_id, "org_id": org_id}, {"_id": 0})
    if not process:
        return

    tasks = await db.tasks.find({"process_id": process_id, "org_id": org_id}, {"_id": 0}).to_list(1000)
    statuses = [t.get("status") for t in tasks]

    if "rejected" in statuses:
        p_status = "rejected"
    elif statuses and all(s in ("done", "approved", "rejected") for s in statuses):
        workflow = await _get_workflow(process["workflow_id"])
        if workflow:
            end_nodes = [n["id"] for n in workflow.get("nodes", []) if n.get("type") == "end"]
            completed = process.get("completed_nodes", [])
            p_status = "completed" if any(e in completed for e in end_nodes) else "running"
        else:
            p_status = "completed"
    else:
        p_status = "running"

    if p_status != process.get("status"):
        await db.process_instances.update_one(
            {"id": process_id, "org_id": org_id},
            {"$set": {"status": p_status, "updated_at": now_iso()}},
        )


async def check_timeouts():
    """Escalate or auto-reject tasks whose deadline has passed."""
    now_dt = datetime.now(timezone.utc)
    now = now_iso()

    expired = await db.tasks.find(
        {"status": {"$in": ["pending", "in_progress"]}, "deadline": {"$lt": now}},
        {"_id": 0},
    ).to_list(1000)

    for task in expired:
        process = await db.process_instances.find_one(
            {"id": task["process_id"], "org_id": task["org_id"]}, {"_id": 0}
        )
        if not process:
            continue

        workflow = await _get_workflow(process["workflow_id"])
        if not workflow:
            continue

        nodes = {n["id"]: n for n in workflow.get("nodes", [])}
        node = nodes.get(task["node_id"])
        if not node:
            continue

        action = node.get("timeout_action", "none")
        if action in (None, "none"):
            continue

        if action == "auto_reject":
            await db.tasks.update_one(
                {"id": task["id"], "org_id": task["org_id"]},
                {"$set": {"status": "rejected", "done_time": now, "updated_at": now}},
            )
            await db.process_instances.update_one(
                {"id": process["id"], "org_id": process["org_id"]},
                {"$addToSet": {"completed_nodes": node["id"]}, "$set": {"updated_at": now}},
            )
            await db.activities.insert_one(
                {
                    "id": new_id(),
                    "org_id": task["org_id"],
                    "actor_name": "سیستم (تایم‌اوت)",
                    "action": "task.rejected",
                    "target_type": "task",
                    "target_id": task["id"],
                    "summary": "تسک به صورت خودکار رد شد (پایان مهلت)",
                    "created_at": now,
                    "updated_at": now,
                }
            )
            await advance_process(
                process_id=process["id"],
                org_id=process["org_id"],
                completed_node_id=node["id"],
                context_update={"_task_status": "rejected"},
            )
            await update_process_status(process["id"], process["org_id"])

        elif action == "escalate_to_manager":
            new_assignee_id = None
            starter_id = process.get("started_by")
            if starter_id:
                starter = await _get_user(starter_id)
                if starter and starter.get("manager_id"):
                    new_assignee_id = starter["manager_id"]

            if new_assignee_id:
                await db.tasks.update_one(
                    {"id": task["id"], "org_id": task["org_id"]},
                    {
                        "$set": {
                            "assignee_id": new_assignee_id,
                            "escalated": True,
                            "deadline": (now_dt + timedelta(days=1)).isoformat(),
                            "updated_at": now,
                        }
                    },
                )
                await db.activities.insert_one(
                    {
                        "id": new_id(),
                        "org_id": task["org_id"],
                        "actor_name": "سیستم (تایم‌اوت)",
                        "action": "task.escalated",
                        "target_type": "task",
                        "target_id": task["id"],
                        "summary": "تسک به دلیل پایان مهلت به مدیر ارجاع شد",
                        "created_at": now,
                        "updated_at": now,
                    }
                )


async def advance_process(
    *,
    process_id: str,
    org_id: str,
    completed_node_id: str,
    context_update: dict | None = None,
) -> dict:
    process = await db.process_instances.find_one({"id": process_id, "org_id": org_id}, {"_id": 0})
    if not process:
        return {"ok": False, "reason": "process_not_found"}

    workflow_obj = await _get_workflow(process["workflow_id"])
    if not workflow_obj:
        # Fall back to the frozen snapshot taken when the process started.
        snapshot = process.get("workflow_snapshot")
        if snapshot:
            workflow_obj = {
                "id": process["workflow_id"],
                "name": process.get("workflow_name", ""),
                "nodes": snapshot.get("nodes", []),
                "edges": snapshot.get("edges", []),
            }
        else:
            return {"ok": False, "reason": "workflow_not_found"}

    workflow_nodes = workflow_obj.get("nodes", [])
    workflow_edges = workflow_obj.get("edges", [])
    workflow_id = workflow_obj.get("id", process["workflow_id"])
    workflow_name = workflow_obj.get("name", process.get("workflow_name", ""))

    ctx = dict(process.get("context") or {})
    ctx_updates = dict(context_update) if context_update else {}
    if ctx_updates:
        ctx.update(ctx_updates)

    new_completed_nodes = []
    completed_nodes = list(process.get("completed_nodes") or [])
    if completed_node_id not in completed_nodes:
        completed_nodes.append(completed_node_id)
        new_completed_nodes.append(completed_node_id)

    next_tasks_data: list[dict] = []
    new_node_ids: list[str] = []
    visited: set[str] = set()
    frontier = [completed_node_id]

    nodes_by_id = {n["id"]: n for n in workflow_nodes}
    edges = workflow_edges

    while frontier:
        current_id = frontier.pop(0)
        if current_id in visited:
            continue
        visited.add(current_id)

        out_edges = _outgoing(edges, current_id)
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
                frontier.append(target_id)
                continue

            dependencies = target_node.get("dependencies") or []
            missing_deps = [d for d in dependencies if d not in completed_nodes]

            if ttype in ("ai_task", "ocr_task"):
                if missing_deps:
                    continue
                output_key, result = await _run_ai_node(
                    node=target_node, context=ctx, process_id=process_id
                )
                if output_key:
                    ctx[output_key] = result
                    ctx_updates[output_key] = result
                if target_id not in completed_nodes:
                    completed_nodes.append(target_id)
                    new_completed_nodes.append(target_id)
                frontier.append(target_id)
                continue

            existing_task = await db.tasks.find_one(
                {
                    "process_id": process_id,
                    "node_id": target_id,
                    "status": {"$in": ["pending", "waiting"]},
                },
                {"_id": 0},
            )
            if existing_task:
                if existing_task["status"] == "waiting" and not missing_deps:
                    await db.tasks.update_one(
                        {"id": existing_task["id"], "org_id": org_id},
                        {"$set": {"status": "pending", "updated_at": now_iso()}},
                    )
                    new_node_ids.append(target_id)
                continue

            task_data = await _node_to_task_data(
                org=process["org_id"],
                process=process,
                workflow_id=workflow_id,
                workflow_name=workflow_name,
                node=target_node,
            )
            if task_data:
                if missing_deps:
                    task_data["status"] = "waiting"
                else:
                    new_node_ids.append(target_id)
                next_tasks_data.append(task_data)
            else:
                if not missing_deps:
                    frontier.append(target_id)

    created_tasks = []
    if next_tasks_data:
        await db.tasks.insert_many([dict(t) for t in next_tasks_data])
        created_tasks = next_tasks_data

    target_types = [nodes_by_id[nid]["type"] for nid in new_node_ids if nid in nodes_by_id]
    has_end = any(t == "end" for t in target_types)
    pending_new_tasks = [t for t in next_tasks_data if t.get("status") != "waiting"]

    if pending_new_tasks:
        new_current = pending_new_tasks[0]["node_id"]
        new_status = "running"
    elif has_end:
        new_current = next(
            (nid for nid in new_node_ids if nodes_by_id.get(nid, {}).get("type") == "end"), None
        )
        new_status = "completed"
    else:
        new_current = process.get("current_node_id")
        new_status = process.get("status", "running")

    update_ops: dict = {
        "$set": {
            "current_node_id": new_current,
            "status": new_status,
            "updated_at": now_iso(),
        }
    }
    if new_completed_nodes:
        update_ops["$addToSet"] = {"completed_nodes": {"$each": new_completed_nodes}}
    for k, v in ctx_updates.items():
        update_ops["$set"][f"context.{k}"] = v

    await db.process_instances.update_one({"id": process_id, "org_id": org_id}, update_ops)

    return {
        "ok": True,
        "next_tasks": [{"id": t["id"], "node_id": t["node_id"]} for t in created_tasks],
        "status": new_status,
    }
