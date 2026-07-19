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

import re
from db import db, new_id, now_iso


def inject_variables(text: str, context: dict) -> str:
    """Injects variables from context into text replacing {{variable}}."""
    if not text:
        return text
    
    def replacer(match):
        key_path = match.group(1).strip().split('.')
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


async def _node_to_task(*, org: str, process: dict, workflow: dict, node: dict) -> Optional[dict]:
    """Build a Task document for a workflow node (returns None for non-actionable nodes)."""
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
        starter = await db.users.find_one({"id": process["started_by"], "org_id": org})
        if starter and starter.get("manager_id"):
            resolved_assignee_id = starter["manager_id"]
        else:
            resolved_assignee_role = "ادمین سازمان" # Fallback if no manager
    elif assignee_type == "department_manager" and process.get("started_by"):
        starter = await db.users.find_one({"id": process["started_by"], "org_id": org})
        if starter and starter.get("department_id"):
            dept = await db.departments.find_one({"id": starter["department_id"], "org_id": org})
            if dept and dept.get("manager_id"):
                resolved_assignee_id = dept["manager_id"]
            else:
                resolved_assignee_role = "ادمین سازمان" # Fallback
        else:
            resolved_assignee_role = "ادمین سازمان" # Fallback

    task_type = (
        "approval" if ntype == "approval"
        else "form" if ntype == "form"
        else "task"
    )

    timeout_seconds = node.get("timeout_seconds")
    if timeout_seconds:
        deadline = (datetime.now(timezone.utc) + timedelta(seconds=timeout_seconds)).isoformat()
    else:
        deadline = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()

    return {
        "id": new_id(),
        "org_id": org,
        "process_id": process["id"],
        "workflow_id": workflow["id"],
        "workflow_name": workflow["name"],
        "node_id": node["id"],
        "title": f"{node.get('label', 'تسک')} — {workflow['name']}",
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
    tasks = await db.tasks.find({"process_id": process_id}).to_list(1000)
    process = await db.processes.find_one({"id": process_id})
    if not process:
        return

    statuses = [t["status"] for t in tasks]
    if "rejected" in statuses:
        p_status = "rejected"
    elif all(s in ("done", "approved", "rejected") for s in statuses) and statuses:
        # Check if workflow reached end node
        workflow = await db.workflows.find_one({"id": process["workflow_id"]})
        if workflow:
            end_nodes = [n["id"] for n in workflow.get("nodes", []) if n.get("type") == "end"]
            completed = process.get("completed_nodes", [])
            if any(e in completed for e in end_nodes):
                p_status = "completed"
            else:
                p_status = "in_progress"
        else:
            p_status = "completed"
    else:
        p_status = "in_progress"

    if p_status != process["status"]:
        await db.processes.update_one({"id": process_id}, {"$set": {"status": p_status, "updated_at": now_iso()}})

async def check_timeouts():
    """
    Finds tasks that have passed their deadline and handles escalation or rejection.
    """
    now = now_iso()
    expired_tasks = await db.tasks.find({
        "status": {"$in": ["pending", "in_progress"]},
        "deadline": {"$lt": now},
        "escalated": {"$ne": True}
    }).to_list(1000)

    for task in expired_tasks:
        process = await db.processes.find_one({"id": task["process_id"]})
        if not process:
            continue
        
        workflow = await db.workflows.find_one({"id": process["workflow_id"]})
        if not workflow:
            continue
            
        nodes = {n["id"]: n for n in workflow.get("nodes", [])}
        node = nodes.get(task["node_id"])
        if not node:
            continue
            
        action = node.get("timeout_action", "none")
        if action == "none":
            continue
            
        if action == "auto_reject":
            await db.tasks.update_one(
                {"id": task["id"]},
                {"$set": {"status": "rejected", "done_time": now, "updated_at": now, "escalated": True}}
            )
            process_completed = process.get("completed_nodes", [])
            process_completed.append(node["id"])
            await db.processes.update_one(
                {"id": process["id"]},
                {"$set": {"completed_nodes": process_completed, "updated_at": now}}
            )
            # Log
            await db.activity_logs.insert_one({
                "id": new_id(),
                "org_id": task["org_id"],
                "actor_name": "سیستم (تایم‌اوت)",
                "action": "task.rejected",
                "target_type": "task",
                "target_id": task["id"],
                "summary": "تسک به صورت خودکار رد شد (پایان مهلت)",
                "created_at": now
            })
            await advance_process(process_id=process["id"], completed_node_id=node["id"])
            await update_process_status(process["id"])
            
        elif action == "escalate_to_manager":
            starter_id = process.get("starter_id")
            new_assignee_id = None
            if starter_id:
                starter = await db.users.find_one({"id": starter_id})
                if starter and starter.get("manager_id"):
                    new_assignee_id = starter["manager_id"]
                    
            if new_assignee_id:
                await db.tasks.update_one(
                    {"id": task["id"]},
                    {"$set": {"assignee_id": new_assignee_id, "assignee_role": None, "escalated": True, "updated_at": now}}
                )
                await db.activity_logs.insert_one({
                    "id": new_id(),
                    "org_id": task["org_id"],
                    "actor_name": "سیستم (تایم‌اوت)",
                    "action": "task.escalated",
                    "target_type": "task",
                    "target_id": task["id"],
                    "summary": "تسک به دلیل پایان مهلت به مدیر ارجاع شد",
                    "created_at": now
                })
            else:
                # No manager to escalate to, just mark as escalated
                await db.tasks.update_one(
                    {"id": task["id"]},
                    {"$set": {"escalated": True, "updated_at": now}}
                )


async def advance_process(*, process_id: str, completed_node_id: str, context_update: dict | None = None) -> dict:
    """After a task completes, traverse outgoing edges from the current node,
    pick branch(es) whose conditions are satisfied, create the next tasks,
    and update process state.

    Returns a summary dict (changes applied) for logging / UI.
    """
    process = await db.process_instances.find_one({"id": process_id}, {"_id": 0})
    if not process:
        return {"ok": False, "reason": "process_not_found"}

    # Use frozen snapshot if available; fall back to live workflow for old instances
    snapshot = process.get("workflow_snapshot")
    if snapshot:
        workflow = {
            "id": process["workflow_id"],
            "name": process.get("workflow_name", ""),
            "nodes": snapshot.get("nodes", []),
            "edges": snapshot.get("edges", []),
        }
    else:
        workflow = await db.workflows.find_one({"id": process["workflow_id"]}, {"_id": 0})
        if not workflow:
            return {"ok": False, "reason": "workflow_not_found"}

    # Merge any new context data (form submission for a node)
    ctx = dict(process.get("context") or {})
    if context_update:
        ctx.update(context_update)

    completed_nodes = list(process.get("completed_nodes") or [])
    if completed_node_id not in completed_nodes:
        completed_nodes.append(completed_node_id)

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
                
            dependencies = target_node.get("dependencies") or []
            missing_deps = [d for d in dependencies if d not in completed_nodes]
            
            if ttype == "ai_task":
                if missing_deps:
                    continue
                
                data = target_node.get("data", {})
                sys_prompt_template = data.get("system_prompt", "")
                output_key = data.get("output_key", "ai_evaluation")
                
                system_prompt = inject_variables(sys_prompt_template, ctx)
                
                from services.ai_service import ai_service
                import logging
                try:
                    ai_result = await ai_service.ask_ai_json(
                        session_id=process_id,
                        system_prompt=system_prompt,
                        user_message="Execute the task based on the provided context and return JSON."
                    )
                except Exception as e:
                    logging.getLogger("raahkar.engine").error(f"AI task failed: {e}")
                    await db.process_instances.update_one(
                        {"id": process_id},
                        {"$set": {"status": "stuck", "updated_at": now_iso()}}
                    )
                    return {
                        "ok": False,
                        "reason": f"ai_task_failed: {e}",
                        "status": "stuck"
                    }
                
                ctx[output_key] = ai_result
                if target_id not in completed_nodes:
                    completed_nodes.append(target_id)
                frontier.append(target_id)
                continue

            if ttype == "ocr_task":
                if missing_deps:
                    continue
                
                data = target_node.get("data", {})
                source_file_variable = data.get("source_file_variable", "")
                extraction_prompt_template = data.get("extraction_prompt", "")
                output_key = data.get("output_key", "ocr_result")
                
                image_data = inject_variables(source_file_variable, ctx).strip()
                extraction_prompt = inject_variables(extraction_prompt_template, ctx)
                
                from services.ai_service import ai_service
                import logging
                try:
                    if not image_data:
                        raise ValueError(f"Image data not found for variable: {source_file_variable}")
                        
                    ai_result = await ai_service.extract_data_from_image(
                        image_data=image_data,
                        prompt=extraction_prompt
                    )
                except Exception as e:
                    logging.getLogger("raahkar.engine").error(f"OCR task failed: {e}")
                    await db.process_instances.update_one(
                        {"id": process_id},
                        {"$set": {"status": "stuck", "updated_at": now_iso()}}
                    )
                    return {
                        "ok": False,
                        "reason": f"ocr_task_failed: {e}",
                        "status": "stuck"
                    }
                
                ctx[output_key] = ai_result
                if target_id not in completed_nodes:
                    completed_nodes.append(target_id)
                frontier.append(target_id)
                continue

            # Check if there is already a waiting task for this target node
            existing_task = await db.tasks.find_one({
                "process_id": process_id,
                "node_id": target_id,
                "status": "waiting"
            })
            
            if existing_task:
                # Update its wait conditions
                new_wait = [d for d in existing_task.get("wait_conditions", []) if d != current_id]
                status = "pending" if not new_wait else "waiting"
                await db.tasks.update_one(
                    {"id": existing_task["id"]},
                    {"$set": {"wait_conditions": new_wait, "status": status, "updated_at": now_iso()}}
                )
                if status == "pending":
                    new_node_ids.append(target_id)
                continue

            task = await _node_to_task(org=process["org_id"], process=process, workflow=workflow, node=target_node)
            if task:
                if missing_deps:
                    task["status"] = "waiting"
                    task["wait_conditions"] = missing_deps
                else:
                    new_node_ids.append(target_id)
                next_tasks.append(task)
            else:
                # trigger or other; just walk further
                if not missing_deps:
                    frontier.append(target_id)

    # Persist new tasks
    if next_tasks:
        await db.tasks.insert_many([dict(t) for t in next_tasks])

    # Determine new process status
    target_types = [nodes_by_id[nid]["type"] for nid in new_node_ids if nid in nodes_by_id]
    has_end = any(t == "end" for t in target_types)
    has_action = bool(next_tasks) or any(t == "pending" for t in [t["status"] for t in next_tasks] if "status" in t) 
    # Wait, the logic for has_action was bool(next_tasks) which means ANY new task was created.
    # Actually if next_tasks were all 'waiting', it shouldn't be the 'current_node_id' 
    
    pending_new_tasks = [t for t in next_tasks if t.get("status") != "waiting"]

    if pending_new_tasks:
        new_current = pending_new_tasks[0]["node_id"]
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
            "completed_nodes": completed_nodes,
            "updated_at": now_iso(),
        }},
    )

    return {
        "ok": True,
        "next_tasks": [{"id": t["id"], "title": t["title"], "node_id": t["node_id"]} for t in next_tasks],
        "status": new_status,
    }


async def simulate_workflow(workflow: dict, mock_context: dict) -> list[dict]:
    """Runs a workflow purely in memory for testing/simulation. No DB writes."""
    import time
    from services.ai_service import ai_service
    
    traces = []
    
    nodes_by_id = {n["id"]: n for n in workflow.get("nodes", [])}
    edges = workflow.get("edges", [])
    
    trigger_nodes = [n for n in workflow.get("nodes", []) if n.get("type") == "trigger"]
    if not trigger_nodes:
        return [{"node_id": None, "status": "error", "result": {"error": "No trigger node found"}}]
        
    current_id = trigger_nodes[0]["id"]
    ctx = dict(mock_context)
    
    completed_nodes = []
    frontier = [current_id]
    visited = set()
    
    while frontier:
        current_id = frontier.pop(0)
        if current_id in visited:
            continue
        visited.add(current_id)
        
        node = nodes_by_id.get(current_id)
        if not node:
            continue
            
        start_time = time.time()
        result_data = {}
        status = "success"
        
        ttype = node.get("type")
        completed_nodes.append(current_id)
        
        try:
            if ttype == "ai_task":
                data = node.get("data", {})
                sys_prompt_template = data.get("system_prompt", "")
                output_key = data.get("output_key", "ai_evaluation")
                system_prompt = inject_variables(sys_prompt_template, ctx)
                ai_result = await ai_service.ask_ai_json(
                    session_id="sim_" + current_id,
                    system_prompt=system_prompt,
                    user_message="Execute the task based on the provided context and return JSON."
                )
                ctx[output_key] = ai_result
                result_data = {"ai_output": ai_result}
                
            elif ttype == "ocr_task":
                data = node.get("data", {})
                source_file_variable = data.get("source_file_variable", "")
                extraction_prompt_template = data.get("extraction_prompt", "")
                output_key = data.get("output_key", "ocr_result")
                image_data = inject_variables(source_file_variable, ctx).strip()
                extraction_prompt = inject_variables(extraction_prompt_template, ctx)
                if not image_data:
                    raise ValueError(f"Image data not found for variable: {source_file_variable}")
                ai_result = await ai_service.extract_data_from_image(
                    image_data=image_data,
                    prompt=extraction_prompt
                )
                ctx[output_key] = ai_result
                result_data = {"ocr_output": ai_result}
                
            elif ttype in ("task", "form", "approval"):
                result_data = {"action": "simulated_manual_completion"}
                
        except Exception as e:
            status = "error"
            result_data = {"error": str(e)}
            
        time_taken_ms = int((time.time() - start_time) * 1000)
        
        traces.append({
            "node_id": current_id,
            "time_taken_ms": time_taken_ms,
            "result": result_data,
            "status": status,
            "context_snapshot": dict(ctx)
        })
        
        if status == "error":
            break
            
        out_edges = _outgoing(edges, current_id)
        conditional = [e for e in out_edges if e.get("condition")]
        defaults = [e for e in out_edges if not e.get("condition")]
        chosen = [e for e in conditional if evaluate_rule(e.get("condition"), ctx)]
        if not chosen and defaults:
            chosen = defaults
            
        for edge in chosen:
            frontier.append(edge["target"])
            
    return traces
