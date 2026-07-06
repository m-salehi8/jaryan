"""Raahkar — Persian-first AI workflow automation platform.

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

from auth import (
    CurrentUser,
    hash_password,
    make_token,
    public_user,
    verify_password,
)
from db import db, new_id, now_iso
from engine import advance_process, evaluate_rule
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
    User,
    UserCreate,
    UserRoleUpdate,
    Workflow,
    WorkflowCreate,
    WorkflowUpdate,
)
from seed import seed as seed_data

# ---------- AI ----------
from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", "http://localhost:20128/v1")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "cf/@cf/moonshotai/kimi-k2.5")

app = FastAPI(title="Raahkar API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("raahkar")


# ---------- Lifecycle ----------
@app.on_event("startup")
async def _startup() -> None:
    result = await seed_data()
    logger.info("seed: %s", result)


@app.on_event("shutdown")
async def _shutdown() -> None:
    db.client.close()


# ---------- Health / Root ----------
@api.get("/")
async def root():
    return {"app": "raahkar", "ok": True}


# ---------- Auth ----------
@api.post("/auth/login", response_model=LoginResponse)
async def login(payload: LoginPayload):
    doc = await db.users.find_one({"email": payload.email}, {"_id": 0})
    if not doc or not verify_password(payload.password, doc["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_credentials")
    user = User(**doc)
    return LoginResponse(token=make_token(user.id, user.org_id), user=public_user(user))


@api.get("/auth/me")
async def me(user: User = CurrentUser):
    return public_user(user)


@api.get("/users")
async def list_users(user: User = CurrentUser):
    rows = await db.users.find({"org_id": user.org_id}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return rows


@api.post("/users")
async def create_user(payload: UserCreate, user: User = CurrentUser):
    if user.role != "ادمین سازمان":
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
    )
    await db.users.insert_one(new_user.to_mongo())
    await _activity(user, "user.created", "user", new_user.id, f"کاربر «{new_user.full_name}» اضافه شد")
    return public_user(new_user)


@api.patch("/users/{uid}")
async def update_user_role(uid: str, payload: UserRoleUpdate, user: User = CurrentUser):
    if user.role != "ادمین سازمان":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "insufficient_permissions")
    doc = await db.users.find_one({"id": uid, "org_id": user.org_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user_not_found")
    await db.users.update_one(
        {"id": uid, "org_id": user.org_id},
        {"$set": {"role": payload.role, "updated_at": now_iso()}},
    )
    updated = await db.users.find_one({"id": uid, "org_id": user.org_id}, {"_id": 0, "password_hash": 0})
    return updated


@api.delete("/users/{uid}")
async def delete_user(uid: str, user: User = CurrentUser):
    if user.role != "ادمین سازمان":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "insufficient_permissions")
    if uid == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "cannot_delete_self")
    doc = await db.users.find_one({"id": uid, "org_id": user.org_id})
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user_not_found")
    await db.users.delete_one({"id": uid, "org_id": user.org_id})
    return {"deleted": True}


# ---------- Workflows ----------
@api.get("/workflows")
async def list_workflows(user: User = CurrentUser):
    rows = await db.workflows.find({"org_id": user.org_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
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
    await _activity(user, "workflow.created", "workflow", wf.id, f"فرایند «{wf.name}» ایجاد شد")
    return wf


@api.get("/workflows/{wf_id}")
async def get_workflow(wf_id: str, user: User = CurrentUser):
    doc = await db.workflows.find_one({"id": wf_id, "org_id": user.org_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "workflow_not_found")
    return doc


@api.patch("/workflows/{wf_id}")
async def update_workflow(wf_id: str, payload: WorkflowUpdate, user: User = CurrentUser):
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
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
    res = await db.workflows.delete_one({"id": wf_id, "org_id": user.org_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "workflow_not_found")
    return {"deleted": True}


@api.post("/workflows/{wf_id}/start")
async def start_workflow(wf_id: str, user: User = CurrentUser):
    wf = await db.workflows.find_one({"id": wf_id, "org_id": user.org_id}, {"_id": 0})
    if not wf:
        raise HTTPException(404, "workflow_not_found")
    if wf.get("status") != "published":
        raise HTTPException(400, "workflow_not_published")
    first_node = next((n for n in wf["nodes"] if n["type"] == "trigger"), wf["nodes"][0] if wf["nodes"] else None)
    instance = ProcessInstance(
        org_id=user.org_id,
        workflow_id=wf["id"],
        workflow_name=wf["name"],
        started_by=user.id,
        current_node_id=first_node["id"] if first_node else None,
        status="running",
        context={"requester": user.full_name},
    )
    await db.process_instances.insert_one(instance.to_mongo())
    await _activity(user, "process.started", "process", instance.id, f"اجرای فرایند «{wf['name']}» آغاز شد")
    # Auto-advance from the trigger node so the first downstream task is created.
    advanced = {}
    if first_node:
        advanced = await advance_process(
            process_id=instance.id,
            completed_node_id=first_node["id"],
        )
    return {"process": instance, "advanced": advanced}


# ---------- Forms ----------
@api.get("/forms")
async def list_forms(user: User = CurrentUser):
    rows = await db.forms.find({"org_id": user.org_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
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
    await _activity(user, "form.created", "form", form.id, f"فرم «{form.name}» ایجاد شد")
    return form


@api.get("/forms/{form_id}")
async def get_form(form_id: str, user: User = CurrentUser):
    doc = await db.forms.find_one({"id": form_id, "org_id": user.org_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "form_not_found")
    return doc


@api.patch("/forms/{form_id}")
async def update_form(form_id: str, payload: FormUpdate, user: User = CurrentUser):
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    updates["updated_at"] = now_iso()
    res = await db.forms.update_one({"id": form_id, "org_id": user.org_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(404, "form_not_found")
    return await get_form(form_id, user)


@api.delete("/forms/{form_id}")
async def delete_form(form_id: str, user: User = CurrentUser):
    res = await db.forms.delete_one({"id": form_id, "org_id": user.org_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "form_not_found")
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
        q["$or"] = [{"assignee_id": user.id}, {"assignee_role": user.role, "assignee_id": None}]
    if status_filter:
        q["status"] = status_filter
    rows = await db.tasks.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return rows


@api.get("/tasks/{task_id}")
async def get_task(task_id: str, user: User = CurrentUser):
    doc = await db.tasks.find_one({"id": task_id, "org_id": user.org_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "task_not_found")
    return doc


@api.patch("/tasks/{task_id}")
async def update_task(task_id: str, payload: TaskUpdate, user: User = CurrentUser):
    doc = await db.tasks.find_one({"id": task_id, "org_id": user.org_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "task_not_found")
    updates: dict = {"updated_at": now_iso()}
    if payload.status is not None:
        updates["status"] = payload.status
    if payload.form_data is not None:
        updates["form_data"] = payload.form_data
    await db.tasks.update_one({"id": task_id}, {"$set": updates})

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
            completed_node_id=doc["node_id"],
            context_update=context_update,
        )

    if payload.status in ("approved", "rejected", "done"):
        summary_map = {
            "approved": f"تسک «{doc['title']}» تایید شد",
            "rejected": f"تسک «{doc['title']}» رد شد",
            "done": f"تسک «{doc['title']}» تکمیل شد",
        }
        await _activity(user, f"task.{payload.status}", "task", task_id, summary_map[payload.status])

    if payload.status == "rejected":
        # Stop the process on rejection
        await db.process_instances.update_one(
            {"id": doc["process_id"]},
            {"$set": {"status": "rejected", "updated_at": now_iso()}},
        )

    task = await get_task(task_id, user)
    return {"task": task, "advanced": advanced}


# ---------- Processes / Monitoring ----------
@api.get("/processes")
async def list_processes(user: User = CurrentUser):
    rows = await db.process_instances.find({"org_id": user.org_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return rows


@api.get("/processes/{pid}")
async def get_process(pid: str, user: User = CurrentUser):
    doc = await db.process_instances.find_one({"id": pid, "org_id": user.org_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "process_not_found")
    tasks = await db.tasks.find({"process_id": pid, "org_id": user.org_id}, {"_id": 0}).to_list(1000)
    wf = await db.workflows.find_one({"id": doc["workflow_id"], "org_id": user.org_id}, {"_id": 0})
    return {"process": doc, "tasks": tasks, "workflow": wf}


# ---------- Dashboard ----------
@api.get("/dashboard")
async def dashboard(user: User = CurrentUser):
    my_q = {"org_id": user.org_id, "$or": [{"assignee_id": user.id}, {"assignee_role": user.role, "assignee_id": None}]}
    my_tasks = await db.tasks.find({**my_q, "status": {"$in": ["pending", "in_progress"]}}, {"_id": 0}).sort("created_at", -1).limit(8).to_list(8)
    pending_approvals = await db.tasks.find({**my_q, "type": "approval", "status": "pending"}, {"_id": 0}).limit(5).to_list(5)
    running = await db.process_instances.find({"org_id": user.org_id, "status": "running"}, {"_id": 0}).sort("created_at", -1).limit(5).to_list(5)
    activities = await db.activities.find({"org_id": user.org_id}, {"_id": 0}).sort("created_at", -1).limit(10).to_list(10)
    counters = {
        "my_tasks": await db.tasks.count_documents({**my_q, "status": {"$in": ["pending", "in_progress"]}}),
        "pending_approvals": await db.tasks.count_documents({**my_q, "type": "approval", "status": "pending"}),
        "running_processes": await db.process_instances.count_documents({"org_id": user.org_id, "status": "running"}),
        "workflows": await db.workflows.count_documents({"org_id": user.org_id}),
    }
    recommendations = [
        {"id": new_id(), "icon": "sparkles", "title": "اتوماسیون فرایند آنبوردینگ کارکنان جدید",
         "reason": "بر اساس الگوی استخدام‌های اخیر، پیشنهاد می‌شود این فرایند ساخته شود."},
        {"id": new_id(), "icon": "clock", "title": "کاهش زمان تایید درخواست مرخصی",
         "reason": "میانگین زمان تایید بیش از حد انتظار است؛ افزودن گیت موازی پیشنهاد می‌گردد."},
        {"id": new_id(), "icon": "trending-up", "title": "افزودن گزارش هفتگی به فرایند تنخواه",
         "reason": "بهبود شفافیت مالی برای مدیران."},
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

    tasks_query = db.tasks.find(
        {"org_id": org, "$or": [{"title": pattern}, {"workflow_name": pattern}]},
        {"_id": 0, "id": 1, "title": 1, "workflow_name": 1, "status": 1},
    ).limit(5).to_list(5)

    processes_query = db.process_instances.find(
        {"org_id": org, "workflow_name": pattern},
        {"_id": 0, "id": 1, "workflow_name": 1, "status": 1},
    ).limit(5).to_list(5)

    forms_query = db.forms.find(
        {"org_id": org, "name": pattern},
        {"_id": 0, "id": 1, "name": 1, "description": 1},
    ).limit(5).to_list(5)

    tasks_raw, processes_raw, forms_raw = await asyncio.gather(
        tasks_query, processes_query, forms_query
    )

    return {
        "tasks": [
            {"type": "task", "id": t["id"], "title": t.get("title", ""), "subtitle": t.get("workflow_name", "")}
            for t in tasks_raw
        ],
        "processes": [
            {"type": "process", "id": p["id"], "title": p.get("workflow_name", ""), "subtitle": p.get("status", "")}
            for p in processes_raw
        ],
        "forms": [
            {"type": "form", "id": f["id"], "title": f.get("name", ""), "subtitle": f.get("description", "") or ""}
            for f in forms_raw
        ],
    }


# ---------- Analytics Dashboard ----------

@api.get("/analytics/dashboard")
async def analytics_dashboard(user: User = CurrentUser):
    import jdatetime

    now = datetime.now(timezone.utc)
    thirty_days_ago = now - timedelta(days=30)
    thirty_days_ago_iso = thirty_days_ago.isoformat()

    def _parse_iso(s: str) -> datetime:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt

    # ---------- Build the 30 Jalali day keys up front ----------
    day_keys: list[str] = []
    for i in range(29, -1, -1):
        dt = now - timedelta(days=i)
        jd = jdatetime.datetime.fromgregorian(datetime=dt)
        day_keys.append(f"{jd.year}-{jd.month:02d}-{jd.day:02d}")

    # ---------- Define all 4 coroutines ----------
    async def _daily_processes():
        pi_docs = await db.process_instances.find(
            {"org_id": user.org_id, "created_at": {"$gte": thirty_days_ago_iso}},
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
        status_keys = ["pending", "in_progress", "approved", "rejected", "done"]
        dist: dict[str, int] = {s: 0 for s in status_keys}
        pipeline = [
            {"$match": {"org_id": user.org_id}},
            {"$group": {"_id": "$status", "count": {"$sum": 1}}},
        ]
        async for bucket in db.tasks.aggregate(pipeline):
            s = bucket["_id"]
            if s in dist:
                dist[s] = bucket["count"]
        return dist

    async def _top_users():
        pipeline = [
            {"$match": {"org_id": user.org_id, "status": {"$in": ["pending", "in_progress"]}, "assignee_id": {"$ne": None}}},
            {"$group": {"_id": "$assignee_id", "task_count": {"$sum": 1}}},
            {"$sort": {"task_count": -1}},
            {"$limit": 5},
        ]
        top_assignees = []
        async for doc in db.tasks.aggregate(pipeline):
            top_assignees.append({"user_id": doc["_id"], "task_count": doc["task_count"]})

        result = []
        for entry in top_assignees:
            u_doc = await db.users.find_one(
                {"id": entry["user_id"], "org_id": user.org_id},
                {"_id": 0, "full_name": 1, "role": 1},
            )
            result.append({
                "user_id": entry["user_id"],
                "full_name": u_doc["full_name"] if u_doc else entry["user_id"],
                "role": u_doc["role"] if u_doc else None,
                "task_count": entry["task_count"],
            })
        return result

    async def _avg_completion_minutes():
        completed_docs = await db.process_instances.find(
            {
                "org_id": user.org_id,
                "status": "completed",
                "updated_at": {"$gte": thirty_days_ago_iso},
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
    daily_processes, task_status_dist, top_users, avg_completion_minutes = await asyncio.gather(
        _daily_processes(),
        _task_status_dist(),
        _top_users(),
        _avg_completion_minutes(),
    )

    return {
        "daily_processes": daily_processes,
        "task_status_dist": task_status_dist,
        "top_users": top_users,
        "avg_completion_minutes": avg_completion_minutes,
    }


# ---------- Comments ----------
@api.get("/comments")
async def list_comments(target_type: str, target_id: str, user: User = CurrentUser):
    rows = await db.comments.find(
        {"org_id": user.org_id, "target_type": target_type, "target_id": target_id},
        {"_id": 0},
    ).sort("created_at", 1).to_list(500)
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
    )
    await db.comments.insert_one(c.to_mongo())
    return c


# ---------- AI Chat-to-Process ----------
SYSTEM_PROMPT = """تو دستیار هوشمند سامانه راهکار هستی؛ یک پلتفرم فارسی برای طراحی فرایند سازمانی.

وظیفه: کاربر یک درخواست به زبان طبیعی فارسی می‌دهد (مثلاً «فرایند درخواست مرخصی بساز»). تو باید:
1) یک پاسخ کوتاه و دوستانه فارسی بدهی (۲ تا ۴ جمله) که خلاصه‌ی فرایند پیشنهادی را توضیح دهد.
2) سپس یک بلوک JSON دقیقاً با فرمت زیر و در یک بلوک ```json ... ``` خروجی بدهی:

{
  "name": "نام فرایند",
  "description": "توضیح کوتاه فارسی",
  "nodes": [
    {"id": "n1", "type": "trigger", "label": "شروع", "position": {"x": 80, "y": 120}, "data": {}},
    {"id": "n2", "type": "form", "label": "تکمیل فرم", "position": {"x": 340, "y": 120}, "data": {"assignee_role": "کارمند"}},
    {"id": "n3", "type": "approval", "label": "تایید مدیر", "position": {"x": 600, "y": 120}, "data": {"assignee_role": "مدیر تیم"}},
    {"id": "n4", "type": "end", "label": "پایان", "position": {"x": 860, "y": 120}, "data": {}}
  ],
  "edges": [
    {"id": "e1", "source": "n1", "target": "n2"},
    {"id": "e2", "source": "n2", "target": "n3"},
    {"id": "e3", "source": "n3", "target": "n4"}
  ]
}

قوانین مهم:
- types فقط می‌تواند یکی از این‌ها باشد: trigger، task، approval، condition، form، end.
- assignee_role باید یکی از این‌ها باشد: «ادمین سازمان»، «طراح فرایند»، «مدیر تیم»، «کارمند».
- موقعیت گره‌ها را به‌صورت خطی و با فاصله ۲۶۰ پیکسل افقی قرار بده.
- همه نام‌ها و برچسب‌ها فارسی باشند.
- پاسخت دقیقاً شامل متن کوتاه فارسی + یک بلوک JSON باشد. هیچ توضیح اضافه‌ای خارج از این فرمت نده.
"""


@api.post("/ai/generate-workflow")
async def generate_workflow(payload: ChatGenerateRequest, user: User = CurrentUser):
    """Stream Persian-first AI workflow generation via SSE."""
    session_id = payload.session_id or new_id()

    # Persist user message
    user_msg_id = new_id()
    await db.chat_messages.insert_one({
        "id": user_msg_id, "org_id": user.org_id, "session_id": session_id,
        "user_id": user.id, "role": "user", "content": payload.message,
        "generated_workflow": None, "created_at": now_iso(), "updated_at": now_iso(),
    })

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=SYSTEM_PROMPT,
        base_url=OPENAI_BASE_URL,
    ).with_model("custom", OPENAI_MODEL)

    async def event_gen():
        full_text = ""
        try:
            async for ev in chat.stream_message(UserMessage(text=payload.message)):
                if isinstance(ev, TextDelta):
                    full_text += ev.content
                    yield f"data: {_sse_escape(ev.content)}\n\n"
                elif isinstance(ev, StreamDone):
                    break
        except Exception as exc:  # network / api
            logger.exception("ai stream failed")
            yield f"event: error\ndata: {_sse_escape(str(exc))}\n\n"
            return

        wf_json = _extract_json_block(full_text)
        await db.chat_messages.insert_one({
            "id": new_id(), "org_id": user.org_id, "session_id": session_id,
            "user_id": user.id, "role": "assistant", "content": full_text,
            "generated_workflow": wf_json, "created_at": now_iso(), "updated_at": now_iso(),
        })
        yield f"event: done\ndata: {_sse_escape_json(wf_json or {})}\n\n"

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@api.get("/ai/sessions/{session_id}")
async def get_session(session_id: str, user: User = CurrentUser):
    rows = await db.chat_messages.find(
        {"session_id": session_id, "org_id": user.org_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(500)
    return rows


# ---------- Helpers ----------
def _sse_escape(text: str) -> str:
    return text.replace("\r", "").replace("\n", "\\n")


def _sse_escape_json(obj) -> str:
    import json
    return json.dumps(obj, ensure_ascii=False).replace("\n", "\\n")


def _extract_json_block(text: str) -> Optional[dict]:
    import json
    import re
    m = re.search(r"```json\s*(\{.*?\})\s*```", text, re.DOTALL)
    if not m:
        m = re.search(r"(\{[\s\S]*\})", text)
        if not m:
            return None
    try:
        return json.loads(m.group(1))
    except Exception:
        return None


async def _activity(user: User, action: str, target_type: str, target_id: str, summary: str) -> None:
    await db.activities.insert_one({
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
    })


# ---------- Wire up ----------
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
