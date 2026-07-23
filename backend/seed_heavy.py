"""Heavy Data Seed for Jaryan."""

from __future__ import annotations

import asyncio
import random
from datetime import datetime, timedelta, timezone

from auth import hash_password
from db import db, new_id, now_iso
from models import (
    Form,
    FormField,
    Organization,
    ProcessInstance,
    Task,
    User,
    Workflow,
    WorkflowEdge,
    WorkflowNode,
    Comment,
    ActivityLog,
    ChatMessage,
)


async def seed_heavy() -> dict:
    existing_org = await db.organizations.find_one(
        {"slug": {"$in": ["jaryan", "raahkar"]}}, {"_id": 0}
    )
    if existing_org:
        org_id = existing_org["id"]
        for col in (
            "organizations",
            "users",
            "forms",
            "workflows",
            "tasks",
            "process_instances",
            "activities",
            "comments",
            "chat_messages",
        ):
            await db[col].delete_many({"org_id": org_id})
        await db.organizations.delete_many({"slug": {"$in": ["jaryan", "raahkar"]}})

    # 1. Organization
    org = Organization(name="سازمان نمونه جریان (داده انبوه)", slug="jaryan")
    await db.organizations.insert_one(org.to_mongo())
    org_id = org.id

    # 2. Users (Many users)
    users_data = [
        ("admin@jaryan.ir", "آرش رضایی", "ادمین سازمان", "#171717"),
        ("admin2@jaryan.ir", "سارا کمالی", "ادمین سازمان", "#2a2a2a"),
        ("designer1@jaryan.ir", "نگار محمدی", "طراح فرایند", "#525252"),
        ("designer2@jaryan.ir", "سینا کرمی", "طراح فرایند", "#4a4a4a"),
        ("manager1@jaryan.ir", "حسین کریمی", "مدیر تیم", "#737373"),
        ("manager2@jaryan.ir", "مریم سعیدی", "مدیر تیم", "#6b6b6b"),
        ("manager3@jaryan.ir", "علی طاهری", "مدیر تیم", "#8a8a8a"),
        ("emp1@jaryan.ir", "سارا احمدی", "کارمند", "#a3a3a3"),
        ("emp2@jaryan.ir", "رضا رحمانی", "کارمند", "#b3b3b3"),
        ("emp3@jaryan.ir", "مینا قاسمی", "کارمند", "#c3c3c3"),
        ("emp4@jaryan.ir", "پویا نجفی", "کارمند", "#d3d3d3"),
        ("emp5@jaryan.ir", "زهرا موسوی", "کارمند", "#e3e3e3"),
        ("emp6@jaryan.ir", "امید راد", "کارمند", "#9a9a9a"),
        ("emp7@jaryan.ir", "ندا شفیعی", "کارمند", "#8f8f8f"),
        ("emp8@jaryan.ir", "محمد امین", "کارمند", "#7f7f7f"),
    ]
    users = []
    for email, name, role, color in users_data:
        users.append(
            User(
                org_id=org_id,
                email=email,
                full_name=name,
                role=role,
                password_hash=hash_password("123456"),
                avatar_color=color,
            )
        )
    await db.users.insert_many([u.to_mongo() for u in users])

    # 3. Forms
    # Leave
    leave_form = Form(
        org_id=org_id,
        name="درخواست مرخصی",
        created_by=users[2].id,
        fields=[
            FormField(
                id=new_id(),
                type="select",
                label="نوع مرخصی",
                required=True,
                options=["استحقاقی", "استعلاجی"],
            ),
            FormField(id=new_id(), type="date", label="تاریخ شروع", required=True),
            FormField(id=new_id(), type="date", label="تاریخ پایان", required=True),
            FormField(id=new_id(), type="textarea", label="توضیحات", required=False),
        ],
    )

    # IT Support
    it_form = Form(
        org_id=org_id,
        name="تیکت پشتیبانی فناوری اطلاعات",
        created_by=users[2].id,
        fields=[
            FormField(
                id=new_id(),
                type="select",
                label="دسته‌بندی",
                required=True,
                options=["سخت‌افزار", "نرم‌افزار", "شبکه", "سایر"],
            ),
            FormField(id=new_id(), type="text", label="عنوان مشکل", required=True),
            FormField(
                id=new_id(), type="textarea", label="شرح کامل مشکل", required=True
            ),
        ],
    )

    # Purchase
    purchase_amount_id = new_id()
    purchase_form = Form(
        org_id=org_id,
        name="درخواست خرید کالا/تجهیزات",
        created_by=users[3].id,
        fields=[
            FormField(id=new_id(), type="text", label="نام کالا", required=True),
            FormField(id=new_id(), type="number", label="تعداد", required=True),
            FormField(
                id=purchase_amount_id,
                type="number",
                label="مبلغ تخمینی (ریال)",
                required=True,
            ),
            FormField(id=new_id(), type="textarea", label="دلیل نیاز", required=True),
        ],
    )

    # Contract
    contract_form = Form(
        org_id=org_id,
        name="بررسی و تایید قرارداد",
        created_by=users[3].id,
        fields=[
            FormField(id=new_id(), type="text", label="طرف قرارداد", required=True),
            FormField(id=new_id(), type="text", label="موضوع قرارداد", required=True),
            FormField(
                id=new_id(), type="number", label="مبلغ قرارداد (ریال)", required=True
            ),
            FormField(
                id=new_id(), type="file", label="فایل پیش‌نویس (PDF)", required=True
            ),
            FormField(
                id=new_id(), type="textarea", label="ملاحظات اولیه", required=False
            ),
        ],
    )

    await db.forms.insert_many(
        [f.to_mongo() for f in [leave_form, it_form, purchase_form, contract_form]]
    )

    # 4. Workflows
    workflows = []

    # IT Support Workflow (Simple)
    it_wf = Workflow(
        org_id=org_id,
        name="فرایند پشتیبانی IT",
        status="published",
        created_by=users[2].id,
        nodes=[
            WorkflowNode(
                id="n1", type="trigger", label="شروع", position={"x": 50, "y": 150}
            ),
            WorkflowNode(
                id="n2",
                type="form",
                label="ثبت تیکت",
                position={"x": 200, "y": 150},
                data={"form_id": it_form.id, "assignee_role": "کارمند"},
            ),
            WorkflowNode(
                id="n3",
                type="task",
                label="بررسی و رفع مشکل",
                position={"x": 400, "y": 150},
                data={"assignee_role": "ادمین سازمان"},
            ),
            WorkflowNode(
                id="n4",
                type="approval",
                label="تایید کاربر",
                position={"x": 600, "y": 150},
                data={"assignee_role": "کارمند"},
            ),
            WorkflowNode(
                id="n5", type="end", label="بسته شد", position={"x": 800, "y": 150}
            ),
        ],
        edges=[
            WorkflowEdge(id="e1", source="n1", target="n2"),
            WorkflowEdge(id="e2", source="n2", target="n3"),
            WorkflowEdge(id="e3", source="n3", target="n4"),
            WorkflowEdge(id="e4", source="n4", target="n5"),
        ],
    )
    workflows.append(it_wf)

    # Purchase Workflow (Medium, conditions)
    pur_wf = Workflow(
        org_id=org_id,
        name="فرایند خرید تجهیزات",
        status="published",
        created_by=users[3].id,
        nodes=[
            WorkflowNode(
                id="n1", type="trigger", label="شروع", position={"x": 50, "y": 200}
            ),
            WorkflowNode(
                id="n2",
                type="form",
                label="فرم خرید",
                position={"x": 200, "y": 200},
                data={"form_id": purchase_form.id, "assignee_role": "کارمند"},
            ),
            WorkflowNode(
                id="n3",
                type="approval",
                label="تایید مدیر",
                position={"x": 350, "y": 200},
                data={"assignee_role": "مدیر تیم"},
            ),
            WorkflowNode(
                id="n4",
                type="condition",
                label="مبلغ > 50 میلیون؟",
                position={"x": 500, "y": 200},
            ),
            WorkflowNode(
                id="n5",
                type="approval",
                label="تایید مالی",
                position={"x": 700, "y": 100},
                data={"assignee_role": "ادمین سازمان"},
            ),
            WorkflowNode(
                id="n6",
                type="task",
                label="اقدام به خرید",
                position={"x": 900, "y": 200},
                data={"assignee_role": "مدیر تیم"},
            ),
            WorkflowNode(
                id="n7", type="end", label="پایان موفق", position={"x": 1100, "y": 200}
            ),
            WorkflowNode(
                id="n8", type="end", label="رد درخواست", position={"x": 700, "y": 300}
            ),
        ],
        edges=[
            WorkflowEdge(id="e1", source="n1", target="n2"),
            WorkflowEdge(id="e2", source="n2", target="n3"),
            WorkflowEdge(
                id="e3",
                source="n3",
                target="n4",
                label="تایید",
                condition={"field_id": "_task_status", "op": "=", "value": "approved"},
            ),
            WorkflowEdge(
                id="e4",
                source="n3",
                target="n8",
                label="رد",
                condition={"field_id": "_task_status", "op": "=", "value": "rejected"},
            ),
            WorkflowEdge(
                id="e5",
                source="n4",
                target="n5",
                label="بله",
                condition={
                    "field_id": purchase_amount_id,
                    "op": ">",
                    "value": "50000000",
                },
            ),
            WorkflowEdge(id="e6", source="n4", target="n6", label="خیر"),
            WorkflowEdge(
                id="e7",
                source="n5",
                target="n6",
                label="تایید",
                condition={"field_id": "_task_status", "op": "=", "value": "approved"},
            ),
            WorkflowEdge(
                id="e8",
                source="n5",
                target="n8",
                label="رد",
                condition={"field_id": "_task_status", "op": "=", "value": "rejected"},
            ),
            WorkflowEdge(id="e9", source="n6", target="n7"),
        ],
    )
    workflows.append(pur_wf)

    # Contract Workflow (Complex with multiple return loops)
    con_wf = Workflow(
        org_id=org_id,
        name="چرخه تایید و انعقاد قرارداد",
        status="published",
        created_by=users[3].id,
        nodes=[
            WorkflowNode(
                id="start", type="trigger", label="شروع", position={"x": 50, "y": 200}
            ),
            WorkflowNode(
                id="draft",
                type="form",
                label="پیش‌نویس قرارداد",
                position={"x": 200, "y": 200},
                data={"form_id": contract_form.id, "assignee_role": "کارمند"},
            ),
            WorkflowNode(
                id="legal",
                type="approval",
                label="بررسی حقوقی",
                position={"x": 400, "y": 200},
                data={"assignee_role": "طراح فرایند"},
            ),
            WorkflowNode(
                id="legal_cond",
                type="condition",
                label="تایید حقوقی؟",
                position={"x": 600, "y": 200},
            ),
            WorkflowNode(
                id="finance",
                type="approval",
                label="بررسی مالی",
                position={"x": 800, "y": 100},
                data={"assignee_role": "مدیر تیم"},
            ),
            WorkflowNode(
                id="finance_cond",
                type="condition",
                label="تایید مالی؟",
                position={"x": 1000, "y": 100},
            ),
            WorkflowNode(
                id="revise",
                type="task",
                label="اصلاح قرارداد",
                position={"x": 600, "y": 400},
                data={"assignee_role": "کارمند"},
            ),
            WorkflowNode(
                id="director",
                type="approval",
                label="تایید نهایی",
                position={"x": 1200, "y": 100},
                data={"assignee_role": "ادمین سازمان"},
            ),
            WorkflowNode(
                id="dir_cond",
                type="condition",
                label="تایید مدیرعامل؟",
                position={"x": 1400, "y": 100},
            ),
            WorkflowNode(
                id="success",
                type="end",
                label="بایگانی قرارداد",
                position={"x": 1600, "y": 100},
            ),
            WorkflowNode(
                id="discard",
                type="end",
                label="لغو کامل",
                position={"x": 1600, "y": 400},
            ),
        ],
        edges=[
            WorkflowEdge(id="e1", source="start", target="draft"),
            WorkflowEdge(id="e2", source="draft", target="legal"),
            WorkflowEdge(id="e3", source="legal", target="legal_cond"),
            WorkflowEdge(
                id="e4",
                source="legal_cond",
                target="finance",
                label="تایید",
                condition={"field_id": "_task_status", "op": "=", "value": "approved"},
            ),
            WorkflowEdge(
                id="e5",
                source="legal_cond",
                target="revise",
                label="نیازمند اصلاح",
                condition={"field_id": "_task_status", "op": "=", "value": "rejected"},
            ),
            WorkflowEdge(id="e6", source="finance", target="finance_cond"),
            WorkflowEdge(
                id="e7",
                source="finance_cond",
                target="director",
                label="تایید",
                condition={"field_id": "_task_status", "op": "=", "value": "approved"},
            ),
            WorkflowEdge(
                id="e8",
                source="finance_cond",
                target="revise",
                label="نیازمند اصلاح",
                condition={"field_id": "_task_status", "op": "=", "value": "rejected"},
            ),
            WorkflowEdge(
                id="e9", source="revise", target="legal", label="ارسال مجدد"
            ),  # Return loop
            WorkflowEdge(id="e10", source="director", target="dir_cond"),
            WorkflowEdge(
                id="e11",
                source="dir_cond",
                target="success",
                label="تایید",
                condition={"field_id": "_task_status", "op": "=", "value": "approved"},
            ),
            WorkflowEdge(
                id="e12",
                source="dir_cond",
                target="discard",
                label="رد قطعی",
                condition={"field_id": "_task_status", "op": "=", "value": "rejected"},
            ),
        ],
    )
    workflows.append(con_wf)
    await db.workflows.insert_many([w.to_mongo() for w in workflows])

    # 5. Simulation Engine for Instances
    all_tasks = []
    all_instances = []
    all_activities = []
    all_comments = []

    start_time = datetime.now(timezone.utc) - timedelta(days=180)

    # Generate around 500 process instances
    for i in range(500):
        wf = random.choice(workflows)
        starter = random.choice(users[7:])  # employees start most things

        current_time = start_time + timedelta(
            days=random.randint(0, 178), hours=random.randint(0, 23)
        )
        pi = ProcessInstance(
            org_id=org_id,
            workflow_id=wf.id,
            workflow_name=wf.name,
            started_by=starter.id,
            status="running",
            context={"simulated": True, "num": i},
            created_at=current_time.isoformat(),
            updated_at=current_time.isoformat(),
        )

        # Build node map
        node_map = {n.id: n for n in wf.nodes}
        edge_map = {}
        for e in wf.edges:
            edge_map.setdefault(e.source, []).append(e)

        current_node_id = next(n.id for n in wf.nodes if n.type == "trigger")
        current_node_id = next(n.id for n in wf.nodes if n.type == "trigger")

        path_history = []
        is_done = False

        while not is_done:
            node = node_map[current_node_id]
            path_history.append((node, current_time))

            # Stop randomly to leave some processes 'running'
            if node.type in ("form", "task", "approval"):
                if random.random() < 0.2:  # 20% chance to be stuck/running here
                    pi.current_node_id = node.id
                    is_done = True
                    break

            # Move to next
            edges = edge_map.get(current_node_id, [])
            if not edges:
                pi.status = "completed"
                pi.current_node_id = node.id
                is_done = True
                break

            if node.type == "end":
                pi.status = (
                    "completed"
                    if "success" in node.id or "بایگانی" in node.label
                    else "rejected"
                )
                pi.current_node_id = node.id
                pi.updated_at = current_time.isoformat()
                is_done = True
                break

            # Pick next edge
            # If condition, randomly pick one branch
            if node.type == "condition":
                edge = random.choice(edges)
            elif node.type in ("approval", "task", "form"):
                # Always follow the first edge (usually to condition) or just straight
                edge = edges[0]
            else:
                edge = edges[0]

            current_node_id = edge.target
            current_time += timedelta(hours=random.randint(1, 48))

        # Now create Task and Activity objects for the path_history
        for idx, (node, t) in enumerate(path_history):
            if node.type in ("form", "task", "approval"):
                # Determine status
                # If it's the last node and process is running, status is pending/in_progress
                if idx == len(path_history) - 1 and pi.status == "running":
                    task_status = random.choice(["pending", "in_progress"])
                else:
                    task_status = random.choice(["done", "approved", "rejected"])
                    if node.type == "approval":
                        task_status = random.choice(
                            ["approved", "approved", "rejected"]
                        )  # lean towards approved
                    elif node.type == "form":
                        task_status = "done"

                # Assignee
                assignees_with_role = [
                    u
                    for u in users
                    if u.role == node.data.get("assignee_role", "کارمند")
                ]
                assignee = (
                    random.choice(assignees_with_role)
                    if assignees_with_role
                    else starter
                )

                t_obj = Task(
                    org_id=org_id,
                    process_id=pi.id,
                    workflow_id=wf.id,
                    workflow_name=wf.name,
                    node_id=node.id,
                    title=node.label,
                    assignee_id=assignee.id,
                    assignee_role=node.data.get("assignee_role"),
                    type=node.type,
                    status=task_status,
                    priority=random.choice(["low", "medium", "high"]),
                    deadline=(t + timedelta(days=2)).isoformat(),
                    description="توضیحات خودکار...",
                    created_at=t.isoformat(),
                    updated_at=current_time.isoformat(),
                )
                all_tasks.append(t_obj)

                # Activity
                act_action = f"task.{task_status}"
                all_activities.append(
                    ActivityLog(
                        org_id=org_id,
                        actor_id=assignee.id,
                        actor_name=assignee.full_name,
                        action=act_action,
                        target_type="task",
                        target_id=t_obj.id,
                        summary=f"وضعیت تسک {node.label} به {task_status} تغییر یافت",
                        created_at=current_time.isoformat(),
                        updated_at=current_time.isoformat(),
                    )
                )

                # Comment
                if random.random() < 0.3:
                    all_comments.append(
                        Comment(
                            org_id=org_id,
                            target_type="task",
                            target_id=t_obj.id,
                            author_id=assignee.id,
                            author_name=assignee.full_name,
                            body="بررسی شد. "
                            + (
                                "لطفا اصلاح کنید."
                                if task_status == "rejected"
                                else "مورد تایید است."
                            ),
                            created_at=current_time.isoformat(),
                            updated_at=current_time.isoformat(),
                        )
                    )

        all_instances.append(pi)

    await db.process_instances.insert_many([p.to_mongo() for p in all_instances])
    if all_tasks:
        await db.tasks.insert_many([t.to_mongo() for t in all_tasks])
    if all_activities:
        await db.activities.insert_many([a.to_mongo() for a in all_activities])
    if all_comments:
        await db.comments.insert_many([c.to_mongo() for c in all_comments])

    return {
        "status": "heavy_seeded",
        "org_id": org_id,
        "instances_created": len(all_instances),
        "tasks_created": len(all_tasks),
    }


if __name__ == "__main__":
    print(asyncio.run(seed_heavy()))
