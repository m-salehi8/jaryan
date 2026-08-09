"""Jaryan — Persian-first AI workflow automation platform.

FastAPI entry point. All routes prefixed with /api.
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, FastAPI, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from croniter import croniter
from bson import ObjectId
from pymongo import ReturnDocument

from auth import (
    CurrentUser,
    hash_password,
    make_token,
    public_user,
    verify_password,
)
from db import db, new_id, now_iso
from engine import advance_process, check_timeouts, evaluate_rule
from models import (
    ChatGenerateRequest,
    Comment,
    CommentCreate,
    Form,
    FormCreate,
    FormUpdate,
    LoginPayload,
    LoginResponse,
    ProcessInstance,
    Task,
    TaskUpdate,
    TaskDraftUpdate,
    User,
    UserCreate,
    UserRoleUpdate,
    Workflow,
    WorkflowCreate,
    WorkflowUpdate,
)
from seed import seed as seed_data
# ---------- AI ----------
from services.ai_service import ai_service

app = FastAPI(title="Jaryan API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("jaryan")


# ---------- Lifecycle ----------
@app.on_event("startup")
async def _startup() -> None:
    if os.environ.get("ENV", "development") != "production":
        result = await seed_data()
        logger.info("seed: %s", result)
    asyncio.create_task(cron_scheduler())


async def cron_scheduler():
    logger.info("Cron scheduler started")
    while True:
        try:
            now_dt = datetime.now(timezone.utc)
            cursor = db.workflows.find({"status": "published", "trigger_type": "cron"})
            async for wf in cursor:
                org_id = wf.get("org_id")
                if not org_id:
                    continue
                expr = wf.get("cron_expression")
                if not expr:
                    continue
                if croniter.match(expr, now_dt):
                    last = wf.get("last_triggered_at")
                    if last:
                        last_dt = datetime.fromisoformat(last.replace("Z", "+00:00"))
                        if (now_dt - last_dt).total_seconds() < 50:
                            continue

                    logger.info(f"Triggering cron workflow {wf['id']} '{wf['name']}' for org {org_id}")
                    await db.workflows.update_one(
                        {"id": wf["id"], "org_id": org_id}, {"$set": {"last_triggered_at": now_iso()}}
                    )

                    first_node = next(
                        (n for n in wf.get("nodes", []) if n["type"] == "trigger"),
                        wf.get("nodes")[0] if wf.get("nodes") else None,
                    )
                    if first_node:
                        instance = ProcessInstance(
                            org_id=org_id,
                            workflow_id=wf["id"],
                            workflow_name=wf["name"],
                            started_by=None,
                            current_node_id=first_node["id"],
                            status="running",
                            completed_nodes=[first_node["id"]],
                            context={"requester": "System (Cron)"},
                            workflow_snapshot={
                                "nodes": wf.get("nodes", []),
                                "edges": wf.get("edges", []),
                            },
                        )
                        await db.process_instances.insert_one(instance.to_mongo())
                        await advance_process(
                            process_id=instance.id, org_id=org_id, completed_node_id=first_node["id"]
                        )

            # Check timeouts for escalation/rejection
            await check_timeouts()
        except Exception as e:
            logger.error(f"Cron scheduler error: {e}")

        now = datetime.now(timezone.utc)
        sleep_seconds = 60 - now.second - (now.microsecond / 1_000_000.0)
        if sleep_seconds < 1:
            sleep_seconds = 60
        await asyncio.sleep(sleep_seconds)


@app.on_event("shutdown")
async def _shutdown() -> None:
    db.client.close()


# ---------- Health / Root ----------
@api.get("/")
async def root():
    return {"app": "jaryan", "ok": True}


# ---------- Auth ----------
@api.post("/auth/login", response_model=LoginResponse)
async def login(payload: LoginPayload):
    doc = await db.users.find_one({"email": payload.email}, {"_id": 0})
    if not doc or not verify_password(payload.password, doc["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_credentials"
        )
    user = User(**doc)
    return LoginResponse(token=make_token(user.id, user.org_id), user=public_user(user))


@api.get("/auth/me")
async def me(user: User = CurrentUser):
    return public_user(user)


@api.get("/users")
async def list_users(user: User = CurrentUser):
    rows = await db.users.find(
        {"org_id": user.org_id}, {"_id": 0, "password_hash": 0}
    ).to_list(1000)
    return rows


@api.post("/users")
async def create_user(payload: UserCreate, user: User = CurrentUser):
    if user.role != "مدیر":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "insufficient_permissions")
    existing = await db.users.find_one({"email": payload.email})
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "email_already_exists")
    new_user = User(
        org_id=user.org_id,
        email=payload.email,
        full_name=payload.full_name,
        role=payload.role,
        password_hash=hash_password(payload.password),
        department_id=payload.department_id,
        manager_id=payload.manager_id,
    )
    await db.users.insert_one(new_user.to_mongo())
    await _activity(
        user,
        "user.created",
        "user",
        new_user.id,
        f"کاربر «{new_user.full_name}» اضافه شد",
    )
    return public_user(new_user)


@api.patch("/users/{uid}")
async def update_user_role(uid: str, payload: UserRoleUpdate, user: User = CurrentUser):
    if user.role != "مدیر":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "insufficient_permissions")
    doc = await db.users.find_one({"id": uid, "org_id": user.org_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user_not_found")
    updates = {"updated_at": now_iso()}
    if payload.role is not None:
        updates["role"] = payload.role
    if payload.department_id is not None:
        updates["department_id"] = payload.department_id
    if payload.manager_id is not None:
        updates["manager_id"] = payload.manager_id

    await db.users.update_one(
        {"id": uid, "org_id": user.org_id},
        {"$set": updates},
    )
    updated = await db.users.find_one(
        {"id": uid, "org_id": user.org_id}, {"_id": 0, "password_hash": 0}
    )
    return updated


@api.delete("/users/{uid}")
async def delete_user(uid: str, user: User = CurrentUser):
    if user.role != "مدیر":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "insufficient_permissions")
    if uid == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "cannot_delete_self")
    doc = await db.users.find_one({"id": uid, "org_id": user.org_id})
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user_not_found")
    await db.users.delete_one({"id": uid, "org_id": user.org_id})
    return {"deleted": True}


# ---------- Departments ----------


@api.get("/departments")
async def list_departments(user: User = CurrentUser):
    rows = await db.departments.find({"org_id": user.org_id}, {"_id": 0}).to_list(1000)
    return rows


@api.post("/departments")
async def create_department(payload: DepartmentCreate, user: User = CurrentUser):
    if user.role != "مدیر":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "insufficient_permissions")
    dept = Department(
        org_id=user.org_id,
        name=payload.name,
        parent_id=payload.parent_id,
        manager_id=payload.manager_id,
    )
    await db.departments.insert_one(dept.to_mongo())
    await _activity(
        user,
        "department.created",
        "department",
        dept.id,
        f"دپارتمان «{dept.name}» ایجاد شد",
    )
    return dept


@api.patch("/departments/{did}")
async def update_department(
    did: str, payload: DepartmentUpdate, user: User = CurrentUser
):
    if user.role != "مدیر":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "insufficient_permissions")
    updates = {
        k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None
    }
    if not updates:
        doc = await db.departments.find_one(
            {"id": did, "org_id": user.org_id}, {"_id": 0}
        )
        if not doc:
            raise HTTPException(404, "department_not_found")
        return doc
    updates["updated_at"] = now_iso()
    res = await db.departments.update_one(
        {"id": did, "org_id": user.org_id}, {"$set": updates}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "department_not_found")
    return await db.departments.find_one({"id": did, "org_id": user.org_id}, {"_id": 0})


@api.delete("/departments/{did}")
async def delete_department(did: str, user: User = CurrentUser):
    if user.role != "مدیر":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "insufficient_permissions")
    res = await db.departments.delete_one({"id": did, "org_id": user.org_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "department_not_found")
    # Also unset parent_id for child departments
    await db.departments.update_many(
        {"parent_id": did, "org_id": user.org_id}, {"$set": {"parent_id": None}}
    )
    # And unset department_id for users in this department
    await db.users.update_many(
        {"department_id": did, "org_id": user.org_id}, {"$set": {"department_id": None}}
    )
    return {"deleted": True}


async def _get_workflow_or_404(wf_id: str, org_id: str) -> dict:
    doc = await db.workflows.find_one({"id": wf_id, "org_id": org_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "workflow_not_found")
    return doc


async def _get_form_or_404(form_id: str, org_id: str) -> dict:
    doc = await db.forms.find_one({"id": form_id, "org_id": org_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "form_not_found")
    return doc


async def _get_process_or_404(pid: str, org_id: str) -> dict:
    doc = await db.process_instances.find_one({"id": pid, "org_id": org_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "process_not_found")
    return doc


# ---------- Workflows ----------
@api.get("/workflows")
async def list_workflows(user: User = CurrentUser):
    rows = (
        await db.workflows.find({"org_id": user.org_id}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(1000)
    )
    return rows


@api.post("/workflows")
async def create_workflow(payload: WorkflowCreate, user: User = CurrentUser):
    wf = Workflow(
        org_id=user.org_id,
        name=payload.name,
        description=payload.description,
        nodes=payload.nodes,
        edges=payload.edges,
        created_by=user.id,
    )
    await db.workflows.insert_one(wf.to_mongo())
    await _activity(
        user, "workflow.created", "workflow", wf.id, f"فرایند «{wf.name}» ایجاد شد"
    )
    return wf


@api.get("/workflows/{wf_id}")
async def get_workflow(wf_id: str, user: User = CurrentUser):
    doc = await _get_workflow_or_404(wf_id, user.org_id)
    return doc


@api.patch("/workflows/{wf_id}")
async def update_workflow(
    wf_id: str, payload: WorkflowUpdate, user: User = CurrentUser
):
    updates = {
        k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None
    }
    if not updates:
        return await get_workflow(wf_id, user)
    updates["updated_at"] = now_iso()
    res = await db.workflows.update_one(
        {"id": wf_id, "org_id": user.org_id}, {"$set": updates}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "workflow_not_found")
    return await get_workflow(wf_id, user)


@api.delete("/workflows/{wf_id}")
async def delete_workflow(wf_id: str, user: User = CurrentUser):
    await _get_workflow_or_404(wf_id, user.org_id)
    await db.workflows.delete_one({"id": wf_id, "org_id": user.org_id})
    return {"deleted": True}


@api.post("/workflows/{wf_id}/start")
async def start_workflow(wf_id: str, user: User = CurrentUser):
    wf = await _get_workflow_or_404(wf_id, user.org_id)
    if wf.get("status") != "published":
        raise HTTPException(400, "workflow_not_published")
    first_node = next(
        (n for n in wf["nodes"] if n["type"] == "trigger"),
        wf["nodes"][0] if wf["nodes"] else None,
    )
    instance = ProcessInstance(
        org_id=user.org_id,
        workflow_id=wf["id"],
        workflow_name=wf["name"],
        started_by=user.id,
        current_node_id=first_node["id"] if first_node else None,
        status="running",
        context={"requester": user.full_name},
        workflow_snapshot={"nodes": wf.get("nodes", []), "edges": wf.get("edges", [])},
    )
    await db.process_instances.insert_one(instance.to_mongo())
    await _activity(
        user,
        "process.started",
        "process",
        instance.id,
        f"اجرای فرایند «{wf['name']}» آغاز شد",
    )
    # Auto-advance from the trigger node so the first downstream task is created.
    advanced = {}
    if first_node:
        advanced = await advance_process(
            process_id=instance.id,
            org_id=instance.org_id,
            completed_node_id=first_node["id"],
        )
    return {"process": instance, "advanced": advanced}


# ---------- Forms ----------
@api.get("/forms")
async def list_forms(user: User = CurrentUser):
    rows = (
        await db.forms.find({"org_id": user.org_id}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(1000)
    )
    return rows


@api.post("/forms")
async def create_form(payload: FormCreate, user: User = CurrentUser):
    form = Form(
        org_id=user.org_id,
        name=payload.name,
        description=payload.description,
        fields=payload.fields,
        created_by=user.id,
    )
    await db.forms.insert_one(form.to_mongo())
    await _activity(
        user, "form.created", "form", form.id, f"فرم «{form.name}» ایجاد شد"
    )
    return form


@api.get("/forms/{form_id}")
async def get_form(form_id: str, user: User = CurrentUser):
    doc = await _get_form_or_404(form_id, user.org_id)
    return doc


@api.patch("/forms/{form_id}")
async def update_form(form_id: str, payload: FormUpdate, user: User = CurrentUser):
    updates = {
        k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None
    }
    updates["updated_at"] = now_iso()
    res = await db.forms.update_one(
        {"id": form_id, "org_id": user.org_id}, {"$set": updates}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "form_not_found")
    return await get_form(form_id, user)


@api.delete("/forms/{form_id}")
async def delete_form(form_id: str, user: User = CurrentUser):
    await _get_form_or_404(form_id, user.org_id)
    await db.forms.delete_one({"id": form_id, "org_id": user.org_id})
    return {"deleted": True}


# ---------- Tasks ----------
@api.get("/tasks")
async def list_tasks(
    user: User = CurrentUser,
    assigned_to_me: bool = Query(default=False),
    status_filter: Optional[str] = Query(default=None, alias="status"),
):
    q: dict = {"org_id": user.org_id}
    if assigned_to_me:
        q["$or"] = [
            {"assignee_id": user.id},
            {"assignee_role": user.role, "assignee_id": None},
        ]
    if status_filter:
        q["status"] = status_filter
    rows = await db.tasks.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return rows

async def _get_task_or_404(task_id: str, org_id: str) -> dict:
    doc = await db.tasks.find_one({"id": task_id, "org_id": org_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "task_not_found")
    return doc

@api.get("/tasks/{task_id}")
async def get_task(task_id: str, user: User = CurrentUser):
    doc = await _get_task_or_404(task_id, user.org_id)
    return doc


@api.patch("/tasks/{task_id}")
async def update_task(task_id: str, payload: TaskUpdate, user: User = CurrentUser):
    doc_initial = await _get_task_or_404(task_id, user.org_id)

    updates: dict = {"updated_at": now_iso()}
    is_completing = payload.status in ("approved", "rejected", "done")

    if payload.status is not None:
        updates["status"] = payload.status
        if payload.status == "in_progress" and not doc_initial.get("seen_time"):
            updates["seen_time"] = now_iso()
        if is_completing:
            updates["done_time"] = now_iso()
    if payload.form_data is not None:
        updates["form_data"] = payload.form_data

    query = {"id": task_id, "org_id": user.org_id}
    if is_completing:
        query["status"] = {"$in": ["pending", "in_progress"]}

    doc = await db.tasks.find_one_and_update(
        query, {"$set": updates}, return_document=ReturnDocument.AFTER
    )

    if not doc:
        existing = await db.tasks.find_one(
            {"id": task_id, "org_id": user.org_id}, {"_id": 0}
        )
        if (
            existing
            and is_completing
            and existing["status"] not in ["pending", "in_progress"]
        ):
            return {"ok": False, "reason": "already_processed", "task": existing}
        raise HTTPException(404, "task_not_found")

    advanced: dict = {}
    if payload.status in ("approved", "done"):
        # Form submissions feed the process context
        context_update = payload.form_data if payload.form_data is not None else None
        # Treat status as a synthetic field "_task_status" available to edges
        if context_update is None:
            context_update = {}
        context_update["_task_status"] = payload.status
        advanced = await advance_process(
            process_id=doc["process_id"],
            org_id=user.org_id,
            completed_node_id=doc["node_id"],
            context_update=context_update,
        )

    if payload.status in ("approved", "rejected", "done"):
        summary_map = {
            "approved": f"تسک «{doc['title']}» تایید شد",
            "rejected": f"تسک «{doc['title']}» رد شد",
            "done": f"تسک «{doc['title']}» تکمیل شد",
        }
        await _activity(
            user, f"task.{payload.status}", "task", task_id, summary_map[payload.status]
        )

    if payload.status == "rejected":
        # Stop the process on rejection
        await db.process_instances.update_one(
            {"id": doc["process_id"]},
            {"$set": {"status": "rejected", "updated_at": now_iso()}},
        )

    task = await get_task(task_id, user)
    return {"task": task, "advanced": advanced}


@api.post("/tasks/{task_id}/draft")
async def save_task_draft(
    task_id: str, payload: TaskDraftUpdate, user: User = CurrentUser
):
    doc = await _get_task_or_404(task_id, user.org_id)
    await db.tasks.update_one(
        {"id": task_id, "org_id": user.org_id},
        {"$set": {"draft_data": payload.draft_data, "updated_at": now_iso()}},
    )
    return {"saved": True}


# ---------- Processes / Monitoring ----------
@api.get("/processes")
async def list_processes(user: User = CurrentUser):
    rows = (
        await db.process_instances.find({"org_id": user.org_id}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(1000)
    )
    return rows


@api.get("/processes/{pid}")
async def get_process(pid: str, user: User = CurrentUser):
    doc = await _get_process_or_404(pid, user.org_id)
    tasks = await db.tasks.find(
        {"process_id": pid, "org_id": user.org_id}, {"_id": 0}
    ).to_list(1000)
    wf = await db.workflows.find_one(
        {"id": doc["workflow_id"], "org_id": user.org_id}, {"_id": 0}
    )
    # If the live workflow is gone or changed, use the frozen snapshot
    snapshot = doc.get("workflow_snapshot")
    if not wf and snapshot:
        wf = {
            "id": doc["workflow_id"],
            "name": doc.get("workflow_name", ""),
            "nodes": snapshot.get("nodes", []),
            "edges": snapshot.get("edges", []),
            "status": "snapshot",
        }
    return {"process": doc, "tasks": tasks, "workflow": wf}


# ---------- Dashboard ----------
@api.get("/dashboard")
async def dashboard(user: User = CurrentUser):
    my_q = {
        "org_id": user.org_id,
        "$or": [
            {"assignee_id": user.id},
            {"assignee_role": user.role, "assignee_id": None},
        ],
    }
    my_tasks = (
        await db.tasks.find(
            {**my_q, "status": {"$in": ["pending", "in_progress"]}}, {"_id": 0}
        )
        .sort("created_at", -1)
        .limit(8)
        .to_list(8)
    )
    pending_approvals = (
        await db.tasks.find(
            {**my_q, "type": "approval", "status": "pending"}, {"_id": 0}
        )
        .limit(5)
        .to_list(5)
    )
    running = (
        await db.process_instances.find(
            {"org_id": user.org_id, "status": "running"}, {"_id": 0}
        )
        .sort("created_at", -1)
        .limit(5)
        .to_list(5)
    )
    activities = (
        await db.activities.find({"org_id": user.org_id}, {"_id": 0})
        .sort("created_at", -1)
        .limit(10)
        .to_list(10)
    )
    counters = {
        "my_tasks": await db.tasks.count_documents(
            {**my_q, "status": {"$in": ["pending", "in_progress"]}}
        ),
        "pending_approvals": await db.tasks.count_documents(
            {**my_q, "type": "approval", "status": "pending"}
        ),
        "running_processes": await db.process_instances.count_documents(
            {"org_id": user.org_id, "status": "running"}
        ),
        "workflows": await db.workflows.count_documents({"org_id": user.org_id}),
    }
    recommendations = [
        {
            "id": new_id(),
            "icon": "sparkles",
            "title": "اتوماسیون فرایند آنبوردینگ کارکنان جدید",
            "reason": "بر اساس الگوی استخدام‌های اخیر، پیشنهاد می‌شود این فرایند ساخته شود.",
        },
        {
            "id": new_id(),
            "icon": "clock",
            "title": "کاهش زمان تایید درخواست مرخصی",
            "reason": "میانگین زمان تایید بیش از حد انتظار است؛ افزودن گیت موازی پیشنهاد می‌گردد.",
        },
        {
            "id": new_id(),
            "icon": "trending-up",
            "title": "افزودن گزارش هفتگی به فرایند تنخواه",
            "reason": "بهبود شفافیت مالی برای مدیران.",
        },
    ]
    return {
        "counters": counters,
        "my_tasks": my_tasks,
        "pending_approvals": pending_approvals,
        "running_processes": running,
        "activities": activities,
        "recommendations": recommendations,
    }


# ---------- Global Search ----------
@api.get("/search")
async def search(q: str = Query(min_length=2), user: User = CurrentUser):
    org = user.org_id
    pattern = {"$regex": q, "$options": "i"}

    tasks_query = (
        db.tasks.find(
            {"org_id": org, "$or": [{"title": pattern}, {"workflow_name": pattern}]},
            {"_id": 0, "id": 1, "title": 1, "workflow_name": 1, "status": 1},
        )
        .limit(5)
        .to_list(5)
    )

    processes_query = (
        db.process_instances.find(
            {"org_id": org, "workflow_name": pattern},
            {"_id": 0, "id": 1, "workflow_name": 1, "status": 1},
        )
        .limit(5)
        .to_list(5)
    )

    forms_query = (
        db.forms.find(
            {"org_id": org, "name": pattern},
            {"_id": 0, "id": 1, "name": 1, "description": 1},
        )
        .limit(5)
        .to_list(5)
    )

    tasks_raw, processes_raw, forms_raw = await asyncio.gather(
        tasks_query, processes_query, forms_query
    )

    return {
        "tasks": [
            {
                "type": "task",
                "id": t["id"],
                "title": t.get("title", ""),
                "subtitle": t.get("workflow_name", ""),
            }
            for t in tasks_raw
        ],
        "processes": [
            {
                "type": "process",
                "id": p["id"],
                "title": p.get("workflow_name", ""),
                "subtitle": p.get("status", ""),
            }
            for p in processes_raw
        ],
        "forms": [
            {
                "type": "form",
                "id": f["id"],
                "title": f.get("name", ""),
                "subtitle": f.get("description", "") or "",
            }
            for f in forms_raw
        ],
    }


# ---------- Analytics Dashboard ----------


@api.get("/analytics/dashboard")
async def analytics_dashboard(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: User = CurrentUser,
):
    import jdatetime

    now = datetime.now(timezone.utc)

    # Try to parse ISO start and end dates
    try:
        start_dt = (
            datetime.fromisoformat(start_date.replace("Z", "+00:00"))
            if start_date
            else (now - timedelta(days=30))
        )
        end_dt = (
            datetime.fromisoformat(end_date.replace("Z", "+00:00")) if end_date else now
        )
    except Exception:
        start_dt = now - timedelta(days=30)
        end_dt = now

    start_iso = start_dt.isoformat()
    end_iso = end_dt.isoformat()

    def _parse_iso(s: str) -> datetime:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt

    # ---------- Build the Jalali day keys between start and end ----------
    day_keys: list[str] = []
    days_diff = (end_dt - start_dt).days
    # limit to max 90 days to avoid huge arrays
    days_diff = min(days_diff, 90)
    if days_diff < 0:
        days_diff = 0

    for i in range(days_diff, -1, -1):
        dt = end_dt - timedelta(days=i)
        jd = jdatetime.datetime.fromgregorian(datetime=dt)
        day_keys.append(f"{jd.year}-{jd.month:02d}-{jd.day:02d}")

    # ---------- Define all 4 coroutines ----------
    async def _daily_processes():
        pi_docs = await db.process_instances.find(
            {"org_id": user.org_id, "created_at": {"$gte": start_iso, "$lte": end_iso}},
            {"_id": 0, "created_at": 1},
        ).to_list(10000)
        counts: dict[str, int] = {k: 0 for k in day_keys}
        for doc in pi_docs:
            raw = doc.get("created_at", "")
            try:
                dt = _parse_iso(raw)
                jd = jdatetime.datetime.fromgregorian(datetime=dt)
                key = f"{jd.year}-{jd.month:02d}-{jd.day:02d}"
                if key in counts:
                    counts[key] += 1
            except Exception:
                pass
        return [{"date": k, "count": counts[k]} for k in day_keys]

    async def _task_status_dist():
        # Get ALL workflows for this org (not filtered by created_at — workflows
        # are created once and reused indefinitely).
        docs = await db.workflows.find(
            {"org_id": user.org_id},
            {"_id": 0, "id": 1, "name": 1},
        ).to_list(100)
        wf_map = {d["id"]: d["name"] for d in docs}
        if not wf_map:
            return []
        pipeline = [
            {
                "$match": {
                    "org_id": user.org_id,
                    "workflow_id": {"$in": list(wf_map.keys())},
                    "created_at": {"$gte": start_iso, "$lte": end_iso},
                }
            },
            {"$group": {"_id": "$workflow_id", "count": {"$sum": 1}}},
        ]
        dist = []
        async for bucket in db.tasks.aggregate(pipeline):
            dist.append(
                {
                    "workflow": wf_map.get(bucket["_id"], bucket["_id"]),
                    "count": bucket["count"],
                }
            )
        return dist

    async def _top_users():
        pipeline = [
            {
                "$match": {
                    "org_id": user.org_id,
                    "status": {"$in": ["approved", "done"]},
                    "assignee_id": {"$ne": None},
                    "created_at": {"$gte": start_iso, "$lte": end_iso},
                }
            },
            {"$group": {"_id": "$assignee_id", "task_count": {"$sum": 1}}},
            {"$sort": {"task_count": -1}},
            {"$limit": 5},
        ]
        top_assignees = []
        async for doc in db.tasks.aggregate(pipeline):
            top_assignees.append(
                {"user_id": doc["_id"], "task_count": doc["task_count"]}
            )

        result = []
        for entry in top_assignees:
            u_doc = await db.users.find_one(
                {"id": entry["user_id"], "org_id": user.org_id},
                {"_id": 0, "full_name": 1, "role": 1},
            )
            result.append(
                {
                    "user_id": entry["user_id"],
                    "full_name": u_doc["full_name"] if u_doc else entry["user_id"],
                    "role": u_doc["role"] if u_doc else None,
                    "task_count": entry["task_count"],
                }
            )
        return result

    async def _avg_completion_minutes():
        completed_docs = await db.process_instances.find(
            {
                "org_id": user.org_id,
                "status": "completed",
                "updated_at": {"$gte": start_iso, "$lte": end_iso},
            },
            {"_id": 0, "created_at": 1, "updated_at": 1},
        ).to_list(10000)
        if not completed_docs:
            return None
        total_minutes = 0.0
        valid_count = 0
        for doc in completed_docs:
            try:
                created = _parse_iso(doc["created_at"])
                updated = _parse_iso(doc["updated_at"])
                delta_minutes = (updated - created).total_seconds() / 60.0
                if delta_minutes >= 0:
                    total_minutes += delta_minutes
                    valid_count += 1
            except Exception:
                pass
        return round(total_minutes / valid_count, 2) if valid_count > 0 else None

    # ---------- Run all 4 queries in parallel ----------
    daily_processes, task_status_dist, top_users, avg_completion_minutes = (
        await asyncio.gather(
            _daily_processes(),
            _task_status_dist(),
            _top_users(),
            _avg_completion_minutes(),
        )
    )

    return {
        "daily_processes": daily_processes,
        "task_status_dist": task_status_dist,
        "top_users": top_users,
        "avg_completion_minutes": avg_completion_minutes,
    }


@api.get("/analytics/users")
async def analytics_users(user: User = CurrentUser):
    users_cursor = db.users.find(
        {"org_id": user.org_id}, {"id": 1, "full_name": 1, "role": 1}
    )
    org_users = await users_cursor.to_list(1000)

    pipeline = [
        {
            "$match": {
                "org_id": user.org_id,
                "status": {"$in": ["approved", "rejected", "done"]},
            }
        },
        {
            "$group": {
                "_id": "$assignee_id",
                "task_count": {"$sum": 1},
                "total_time": {
                    "$sum": {
                        "$subtract": [
                            {"$toDate": "$updated_at"},
                            {"$toDate": "$created_at"},
                        ]
                    }
                },
            }
        },
    ]

    stats = {}
    async for doc in db.tasks.aggregate(pipeline):
        if doc["_id"]:
            stats[doc["_id"]] = {
                "task_count": doc["task_count"],
                "avg_lead_time": round(
                    (doc["total_time"] / doc["task_count"]) / 60000, 2
                ),
            }

    result = []
    for u in org_users:
        s = stats.get(u["id"], {"task_count": 0, "avg_lead_time": 0})
        result.append(
            {
                "user_id": u["id"],
                "full_name": u.get("full_name", ""),
                "role": u.get("role", ""),
                "task_count": s["task_count"],
                "avg_lead_time": s["avg_lead_time"],
            }
        )
    return result


@api.get("/analytics/workflows/{wf_id}/heatmap")
async def analytics_workflow_heatmap(wf_id: str, user: User = CurrentUser):
    pipeline = [
        {
            "$match": {
                "org_id": user.org_id,
                "workflow_id": wf_id,
                "status": {"$in": ["approved", "rejected", "done"]},
            }
        },
        {
            "$group": {
                "_id": "$node_id",
                "avg_time": {
                    "$avg": {
                        "$subtract": [
                            {"$toDate": "$updated_at"},
                            {"$toDate": "$created_at"},
                        ]
                    }
                },
                "count": {"$sum": 1},
            }
        },
    ]
    heatmap = {}
    async for doc in db.tasks.aggregate(pipeline):
        if doc["_id"]:
            heatmap[doc["_id"]] = {
                "avg_time_minutes": (
                    round(doc["avg_time"] / 60000, 2) if doc["avg_time"] else 0
                ),
                "count": doc["count"],
            }
    return heatmap


@api.get("/analytics/workflow-distribution")
async def analytics_workflow_distribution(user: User = CurrentUser):
    """Distribution of process instances grouped by workflow name."""
    pipeline = [
        {"$match": {"org_id": user.org_id}},
        {"$group": {"_id": "$workflow_name", "count": {"$sum": 1}}},
    ]
    result = []
    async for doc in db.process_instances.aggregate(pipeline):
        result.append({"name": doc["_id"], "value": doc["count"]})
    return result


@api.get("/analytics/forms")
async def analytics_forms(user: User = CurrentUser):
    """Form usage analytics — how many processes ran per form."""
    # Build a mapping from form_id → form name
    forms_cursor = db.forms.find(
        {"org_id": user.org_id}, {"_id": 0, "id": 1, "name": 1}
    )
    form_map: dict[str, str] = {}
    async for f in forms_cursor:
        if f.get("id"):
            form_map[f["id"]] = f.get("name", f["id"])

    # Collect all process instances and extract form_ids from their workflow node data
    # Approach: get all process instances → find their workflow → read node data.form_id
    wf_ids = set()
    async for pi in db.process_instances.find(
        {"org_id": user.org_id}, {"_id": 0, "workflow_id": 1}
    ):
        if pi.get("workflow_id"):
            wf_ids.add(pi["workflow_id"])

    # Get workflows that have form nodes
    form_usage: dict[str, int] = {}
    if wf_ids:
        async for wf in db.workflows.find(
            {"id": {"$in": list(wf_ids)}}, {"_id": 0, "id": 1, "nodes": 1}
        ):
            for node in wf.get("nodes", []):
                fid = node.get("data", {}).get("form_id")
                if fid and fid in form_map:
                    count = await db.process_instances.count_documents(
                        {"workflow_id": wf["id"], "org_id": user.org_id}
                    )
                    form_usage[form_map[fid]] = form_usage.get(form_map[fid], 0) + count

    return [
        {"name": name, "value": count}
        for name, count in sorted(form_usage.items(), key=lambda x: -x[1])
    ]


# ---------- Comments ----------
@api.get("/comments")
async def list_comments(target_type: str, target_id: str, user: User = CurrentUser):
    rows = (
        await db.comments.find(
            {"org_id": user.org_id, "target_type": target_type, "target_id": target_id},
            {"_id": 0},
        )
        .sort("created_at", 1)
        .to_list(500)
    )
    return rows


@api.post("/comments")
async def add_comment(payload: CommentCreate, user: User = CurrentUser):
    c = Comment(
        org_id=user.org_id,
        target_type=payload.target_type,
        target_id=payload.target_id,
        author_id=user.id,
        author_name=user.full_name,
        body=payload.body,
        mentions=payload.mentions or [],
    )
    await db.comments.insert_one(c.to_mongo())

    if c.mentions:
        for m in c.mentions:
            await _activity(
                user,
                "user.mentioned",
                "user",
                m,
                f"شما توسط {user.full_name} منشن شدید",
            )

    return c


# ---------- AI Chat-to-Process ----------


@api.post("/ai/generate-workflow")
async def generate_workflow(payload: ChatGenerateRequest, user: User = CurrentUser):
    """Stream Persian-first AI workflow generation via SSE."""
    session_id = payload.session_id or new_id()

    # Persist user message
    user_msg_id = new_id()
    await db.chat_messages.insert_one(
        {
            "id": user_msg_id,
            "org_id": user.org_id,
            "session_id": session_id,
            "user_id": user.id,
            "role": "user",
            "content": payload.message,
            "generated_workflow": None,
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
    )

    async def event_gen():
        full_text = ""
        try:
            async for chunk in ai_service.stream_workflow_generation(
                session_id, payload.message
            ):
                full_text += chunk
                yield f"data: {_sse_escape(chunk)}\n\n"
        except Exception as exc:  # network / api
            logger.exception("ai stream failed")
            yield f"event: error\ndata: {_sse_escape(str(exc))}\n\n"
            return

        try:
            wf_json = ai_service.extract_json_block(full_text)
        except Exception:
            wf_json = None

        await db.chat_messages.insert_one(
            {
                "id": new_id(),
                "org_id": user.org_id,
                "session_id": session_id,
                "user_id": user.id,
                "role": "assistant",
                "content": full_text,
                "generated_workflow": wf_json,
                "created_at": now_iso(),
                "updated_at": now_iso(),
            }
        )
        yield f"event: done\ndata: {_sse_escape_json(wf_json or {})}\n\n"

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@api.get("/ai/sessions/{session_id}")
async def get_session(session_id: str, user: User = CurrentUser):
    rows = (
        await db.chat_messages.find(
            {"session_id": session_id, "org_id": user.org_id}, {"_id": 0}
        )
        .sort("created_at", 1)
        .to_list(500)
    )
    return rows


# ---------- Helpers ----------
def _sse_escape(text: str) -> str:
    return text.replace("\r", "").replace("\n", "\\n")


def _sse_escape_json(obj) -> str:
    import json

    return json.dumps(obj, ensure_ascii=False).replace("\n", "\\n")


async def _activity(
    user: User, action: str, target_type: str, target_id: str, summary: str
) -> None:
    await db.activities.insert_one(
        {
            "id": new_id(),
            "org_id": user.org_id,
            "actor_id": user.id,
            "actor_name": user.full_name,
            "action": action,
            "target_type": target_type,
            "target_id": target_id,
            "summary": summary,
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
    )


# ---------- Wire up ----------
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
