"""Process execution engine for Jaryan.

Evaluates outgoing edges from the current node, picks the next node(s),
creates the corresponding tasks, and updates the process instance.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional
import re
import uuid

from asgiref.sync import sync_to_async
from django.utils import timezone as django_timezone

from core.models import User, Department, Workflow, Task as ORMTask, Organization
from core.mongo import get_db

def new_id() -> str:
    return str(uuid.uuid4())

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

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


@sync_to_async
def _get_workflow(workflow_id: str):
    return Workflow.objects.filter(id=workflow_id).first()

@sync_to_async
def _get_user(user_id: str, org_id: str):
    return User.objects.filter(id=user_id, org_id=org_id).first()

@sync_to_async
def _get_department(dept_id: str, org_id: str):
    return Department.objects.filter(id=dept_id, org_id=org_id).first()

@sync_to_async
def _get_task(task_id: str):
    return ORMTask.objects.filter(id=task_id).first()

@sync_to_async
def _get_all_tasks_for_process(process_instance_id: str):
    return list(ORMTask.objects.filter(process_instance_id=process_instance_id))

@sync_to_async
def _get_tasks_by_status(statuses, max_deadline):
    return list(ORMTask.objects.filter(status__in=statuses, updated_at__lt=max_deadline))

@sync_to_async
def _create_task(task_data: dict, workflow: Workflow, org_id: str):
    user = None
    if task_data.get("assignee_id"):
        user = User.objects.filter(id=task_data["assignee_id"]).first()
    elif task_data.get("assignee_role"):
        # Simplistic role assignment, pick first user with role or admin
        user = User.objects.filter(role=task_data["assignee_role"], org_id=org_id).first()
        if not user:
            user = User.objects.filter(org_id=org_id).first() # Fallback
            
    if not user:
        # Cannot assign task to nobody in ORM if assigned_to is required
        # For this prototype we fallback to any user in org
        user = User.objects.filter(org_id=org_id).first()

    return ORMTask.objects.create(
        id=task_data["id"],
        org_id=org_id,
        workflow=workflow,
        process_instance_id=task_data["process_id"],
        node_id=task_data["node_id"],
        assigned_to=user,
        status=task_data.get("status", "pending")
    )


async def _node_to_task_data(
    *, org: str, process: dict, workflow_id: str, workflow_name: str, node: dict
) -> Optional[dict]:
    """Build task data dict for a workflow node."""
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
        starter = await _get_user(process["started_by"], org)
        if starter and starter.manager_id:
            resolved_assignee_id = starter.manager_id
        else:
            resolved_assignee_role = "ادمین سازمان"
    elif assignee_type == "department_manager" and process.get("started_by"):
        starter = await _get_user(process["started_by"], org)
        if starter and starter.department_id:
            dept = await _get_department(starter.department_id, org)
            if dept and dept.manager_id:
                resolved_assignee_id = dept.manager_id
            else:
                resolved_assignee_role = "ادمین سازمان"
        else:
            resolved_assignee_role = "ادمین سازمان"

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
        "priority": "medium",
        "deadline": deadline,
        "form_id": form_id,
        "form_data": {},
        "field_permissions": field_permissions,
        "description": "",
        "escalated": False,
        "attempt_number": 1,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }


def _outgoing(edges: list[dict], node_id: str) -> list[dict]:
    return [e for e in edges if e.get("source") == node_id]


async def update_process_status(process_id: str):
    tasks = await _get_all_tasks_for_process(process_id)
    db = get_db()
    process = await db.process_instances.find_one({"id": process_id})
    if not process:
        return

    statuses = [t.status for t in tasks]
    if "rejected" in statuses:
        p_status = "rejected"
    elif all(s in ("done", "approved", "rejected") for s in statuses) and statuses:
        workflow = await _get_workflow(process["workflow_id"])
        if workflow:
            end_nodes = [n["id"] for n in workflow.nodes if n.get("type") == "end"]
            completed = process.get("completed_nodes", [])
            if any(e in completed for e in end_nodes):
                p_status = "completed"
            else:
                p_status = "in_progress"
        else:
            p_status = "completed"
    else:
        p_status = "in_progress"

    if p_status != process.get("status"):
        await db.process_instances.update_one(
            {"id": process_id}, {"$set": {"status": p_status, "updated_at": now_iso()}}
        )

@sync_to_async
def _get_expired_tasks(now_dt):
    # status__in=["pending", "in_progress"] would be needed if tasks have those statuses
    # For now we use the ones available in Task.STATUS_CHOICES
    return list(ORMTask.objects.filter(
        status__in=["pending"],
        created_at__lt=now_dt - timedelta(days=3) # simplistic timeout since we don't store deadline in ORM
    ))

async def check_timeouts():
    db = get_db()
    now_dt = django_timezone.now()
    now = now_iso()
    
    expired_tasks = await _get_expired_tasks(now_dt)

    for task in expired_tasks:
        process = await db.process_instances.find_one({"id": task.process_instance_id})
        if not process:
            continue

        workflow = await _get_workflow(process["workflow_id"])
        if not workflow:
            continue

        nodes = {n["id"]: n for n in workflow.nodes}
        node = nodes.get(task.node_id)
        if not node:
            continue

        action = node.get("timeout_action", "none")
        if action == "none":
            continue

        if action == "auto_reject":
            await sync_to_async(ORMTask.objects.filter(id=task.id).update)(status="rejected", updated_at=now_dt)
            process_completed = process.get("completed_nodes", [])
            process_completed.append(node["id"])
            await db.process_instances.update_one(
                {"id": process["id"]},
                {"$set": {"completed_nodes": process_completed, "updated_at": now}},
            )
            await db.activity_logs.insert_one(
                {
                    "id": new_id(),
                    "org_id": task.org_id,
                    "actor_name": "سیستم (تایم‌اوت)",
                    "action": "task.rejected",
                    "target_type": "task",
                    "target_id": str(task.id),
                    "summary": "تسک به صورت خودکار رد شد (پایان مهلت)",
                    "created_at": now,
                }
            )
            await advance_process(process_id=process["id"], completed_node_id=node["id"])
            await update_process_status(process["id"])

        elif action == "escalate_to_manager":
            starter_id = process.get("started_by")
            new_assignee = None
            if starter_id:
                starter = await _get_user(starter_id, task.org_id)
                if starter and starter.manager_id:
                    new_assignee = await _get_user(starter.manager_id, task.org_id)

            if new_assignee:
                await sync_to_async(ORMTask.objects.filter(id=task.id).update)(
                    assigned_to=new_assignee, updated_at=now_dt
                )
                await db.activity_logs.insert_one(
                    {
                        "id": new_id(),
                        "org_id": task.org_id,
                        "actor_name": "سیستم (تایم‌اوت)",
                        "action": "task.escalated",
                        "target_type": "task",
                        "target_id": str(task.id),
                        "summary": "تسک به دلیل پایان مهلت به مدیر ارجاع شد",
                        "created_at": now,
                    }
                )


async def advance_process(
    *, process_id: str, completed_node_id: str, context_update: dict | None = None
) -> dict:
    db = get_db()
    process = await db.process_instances.find_one({"id": process_id}, {"_id": 0})
    if not process:
        return {"ok": False, "reason": "process_not_found"}

    workflow_obj = await _get_workflow(process["workflow_id"])
    if not workflow_obj:
        return {"ok": False, "reason": "workflow_not_found"}
        
    workflow_nodes = workflow_obj.nodes
    workflow_edges = workflow_obj.edges

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
                # simplified for now, as in previous code, just pass-through with no real AI since we don't have it
                if target_id not in completed_nodes:
                    completed_nodes.append(target_id)
                    new_completed_nodes.append(target_id)
                frontier.append(target_id)
                continue

            # check if there's an existing pending task for this target node
            existing_task = await sync_to_async(ORMTask.objects.filter(
                process_instance_id=process_id, node_id=target_id, status__in=["pending", "waiting"]
            ).first)()

            if existing_task:
                # Assuming ORM doesn't store wait conditions, we just leave it pending
                if existing_task.status == "waiting" and not missing_deps:
                    await sync_to_async(ORMTask.objects.filter(id=existing_task.id).update)(status="pending")
                    new_node_ids.append(target_id)
                continue

            task_data = await _node_to_task_data(
                org=process["org_id"],
                process=process,
                workflow_id=str(workflow_obj.id),
                workflow_name=workflow_obj.name,
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
        for t_data in next_tasks_data:
            t_obj = await _create_task(t_data, workflow_obj, process["org_id"])
            created_tasks.append(t_obj)

    target_types = [nodes_by_id[nid]["type"] for nid in new_node_ids if nid in nodes_by_id]
    has_end = any(t == "end" for t in target_types)
    pending_new_tasks = [t for t in next_tasks_data if t.get("status") != "waiting"]

    if pending_new_tasks:
        new_current = pending_new_tasks[0]["node_id"]
        new_status = "running"
    elif has_end:
        new_current = next((nid for nid in new_node_ids if nodes_by_id.get(nid, {}).get("type") == "end"), None)
        new_status = "completed"
    else:
        new_current = process.get("current_node_id")
        new_status = process.get("status", "running")

    update_ops = {
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

    await db.process_instances.update_one({"id": process_id}, update_ops)

    return {
        "ok": True,
        "next_tasks": [{"id": str(t.id), "node_id": t.node_id} for t in created_tasks],
        "status": new_status,
    }
