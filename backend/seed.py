"""Seed default Iran-localised organisation, users, workflows, forms, tasks."""

from __future__ import annotations

import asyncio
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
    ChatMessage,
)


async def seed() -> dict:
    # Idempotent + auto-migration: if the latest sample form ("درخواست خدمات")
    # is missing, wipe and reseed so new schema features show up.
    existing_org = await db.organizations.find_one(
        {"slug": {"$in": ["jaryan", "raahkar"]}}, {"_id": 0}
    )
    if existing_org:
        has_services_form = await db.forms.find_one(
            {"org_id": existing_org["id"], "name": "فرم درخواست خدمات (پشتیبانی)"},
            {"_id": 0},
        )
        has_hire_form = await db.forms.find_one(
            {"org_id": existing_org["id"], "name": "فرم درخواست استخدام"},
            {"_id": 0},
        )
        if (
            has_services_form
            and has_hire_form
            and existing_org.get("name") == "سازمان نمونه جریان"
        ):
            return {"status": "exists", "org_id": existing_org["id"]}
        # Wipe and recreate
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
            await db[col].delete_many({"org_id": existing_org["id"]})
        # Org doc itself is in `organizations` and was scoped by org_id=id mismatch above;
        # clean it by direct delete.
        await db.organizations.delete_many({"slug": {"$in": ["jaryan", "raahkar"]}})

    org = Organization(name="سازمان نمونه جریان", slug="jaryan")
    await db.organizations.insert_one(org.to_mongo())

    users = [
        User(
            org_id=org.id,
            email="admin@jaryan.ir",
            full_name="آرش رضایی",
            role="مدیر",
            password_hash=hash_password("admin1234"),
            avatar_color="#171717",
        ),
        User(
            org_id=org.id,
            email="designer@jaryan.ir",
            full_name="نگار محمدی",
            role="مدیر",
            password_hash=hash_password("1234"),
            avatar_color="#525252",
        ),
        User(
            org_id=org.id,
            email="manager@jaryan.ir",
            full_name="حسین کریمی",
            role="مدیر",
            password_hash=hash_password("1234"),
            avatar_color="#737373",
        ),
        User(
            org_id=org.id,
            email="employee@jaryan.ir",
            full_name="سارا احمدی",
            role="کارمند",
            password_hash=hash_password("1234"),
            avatar_color="#a3a3a3",
        ),
    ]
    await db.users.insert_many([u.to_mongo() for u in users])

    admin, designer, manager, employee = users

    # ---- Form: درخواست مرخصی
    leave_form = Form(
        org_id=org.id,
        name="فرم درخواست مرخصی",
        description="فرم استاندارد برای ثبت درخواست مرخصی کارکنان",
        fields=[
            FormField(id=new_id(), type="heading", label="اطلاعات درخواست مرخصی"),
            FormField(
                id=new_id(),
                type="select",
                label="نوع مرخصی",
                required=True,
                options=["استحقاقی", "استعلاجی", "بدون حقوق", "ساعتی"],
            ),
            FormField(id=new_id(), type="date", label="تاریخ شروع", required=True),
            FormField(id=new_id(), type="date", label="تاریخ پایان", required=True),
            FormField(
                id=new_id(),
                type="textarea",
                label="توضیحات",
                placeholder="دلیل درخواست را وارد کنید",
            ),
        ],
        created_by=designer.id,
    )

    # ---- Form: درخواست تنخواه
    petty_form = Form(
        org_id=org.id,
        name="فرم درخواست تنخواه",
        description="درخواست تنخواه برای هزینه‌های جاری",
        fields=[
            FormField(id=new_id(), type="heading", label="اطلاعات تنخواه"),
            FormField(id=new_id(), type="text", label="عنوان درخواست", required=True),
            FormField(id=new_id(), type="number", label="مبلغ (ریال)", required=True),
            FormField(id=new_id(), type="textarea", label="شرح مصرف", required=True),
        ],
        created_by=designer.id,
    )

    # ---- Form: درخواست خدمات (نمونه پیشرفته: تب گروهی + فیلد شرطی)
    tab_field_id = new_id()
    tab1 = {"id": new_id(), "label": "درخواست نیروی پذیرایی"}
    tab2 = {"id": new_id(), "label": "درخواست خدمات نظافت"}
    tab3 = {"id": new_id(), "label": "درخواست شست و شوی منسوجات"}
    tab4 = {"id": new_id(), "label": "درخواست جابه‌جایی وسایل"}
    tab5 = {"id": new_id(), "label": "تخلیه بار"}

    amount_field_id = new_id()
    type_field_id = new_id()

    services_form = Form(
        org_id=org.id,
        name="فرم درخواست خدمات (پشتیبانی)",
        description="نمونه‌ی پیشرفته: انتخاب نوع خدمات با تب و نمایش فیلدهای وابسته",
        created_by=designer.id,
        fields=[
            FormField(
                id=new_id(), type="heading", label="درخواست خدمات (نظافت، نیرو و...)"
            ),
            FormField(
                id=tab_field_id,
                type="tabs",
                label="سرفصل خدمات",
                tab_options=[tab1, tab2, tab3, tab4, tab5],
            ),
            # Tab 1: نیروی پذیرایی
            FormField(
                id=new_id(),
                type="text",
                label="محل استفاده",
                required=True,
                parent_tab_field_id=tab_field_id,
                parent_tab_id=tab1["id"],
            ),
            FormField(
                id=new_id(),
                type="date",
                label="تاریخ درخواست",
                required=True,
                parent_tab_field_id=tab_field_id,
                parent_tab_id=tab1["id"],
            ),
            FormField(
                id=new_id(),
                type="number",
                label="تعداد نیروی مورد نیاز",
                required=True,
                parent_tab_field_id=tab_field_id,
                parent_tab_id=tab1["id"],
            ),
            FormField(
                id=new_id(),
                type="text",
                label="از ساعت",
                placeholder="مثلاً ۸:۰۰",
                parent_tab_field_id=tab_field_id,
                parent_tab_id=tab1["id"],
            ),
            FormField(
                id=new_id(),
                type="text",
                label="تا ساعت",
                placeholder="مثلاً ۱۷:۰۰",
                parent_tab_field_id=tab_field_id,
                parent_tab_id=tab1["id"],
            ),
            # Tab 2: نظافت
            FormField(
                id=new_id(),
                type="textarea",
                label="شرح خدمات درخواستی",
                required=True,
                parent_tab_field_id=tab_field_id,
                parent_tab_id=tab2["id"],
            ),
            FormField(
                id=new_id(),
                type="text",
                label="محل اجرا",
                required=True,
                parent_tab_field_id=tab_field_id,
                parent_tab_id=tab2["id"],
            ),
            # Tab 3: شست و شوی منسوجات
            FormField(
                id=new_id(),
                type="select",
                label="نوع پارچه",
                options=["ملحفه", "روبالشی", "پرده", "پادری", "سایر"],
                required=True,
                parent_tab_field_id=tab_field_id,
                parent_tab_id=tab3["id"],
            ),
            FormField(
                id=amount_field_id,
                type="number",
                label="تعداد اقلام",
                required=True,
                parent_tab_field_id=tab_field_id,
                parent_tab_id=tab3["id"],
            ),
            # Tab 4: جابه‌جایی
            FormField(
                id=new_id(),
                type="text",
                label="مبدا",
                required=True,
                parent_tab_field_id=tab_field_id,
                parent_tab_id=tab4["id"],
            ),
            FormField(
                id=new_id(),
                type="text",
                label="مقصد",
                required=True,
                parent_tab_field_id=tab_field_id,
                parent_tab_id=tab4["id"],
            ),
            # Tab 5: تخلیه بار
            FormField(
                id=new_id(),
                type="text",
                label="مشخصات بار",
                required=True,
                parent_tab_field_id=tab_field_id,
                parent_tab_id=tab5["id"],
            ),
        ],
    )

    # ---- Form: درخواست استخدام
    hire_form = Form(
        org_id=org.id,
        name="فرم درخواست استخدام",
        description="فرم ثبت درخواست استخدام نیروی جدید",
        created_by=designer.id,
        fields=[
            FormField(id=new_id(), type="heading", label="اطلاعات متقاضی"),
            FormField(
                id=new_id(), type="text", label="نام و نام خانوادگی", required=True
            ),
            FormField(
                id=new_id(), type="text", label="موقعیت شغلی پیشنهادی", required=True
            ),
            FormField(
                id=new_id(),
                type="select",
                label="دپارتمان",
                required=True,
                options=["فنی و مهندسی", "منابع انسانی", "فروش و بازاریابی", "مالی"],
            ),
            FormField(
                id=new_id(), type="number", label="حقوق پیشنهادی (ریال)", required=False
            ),
            FormField(
                id=new_id(), type="textarea", label="ارزیابی اولیه", required=True
            ),
        ],
    )

    await db.forms.insert_many(
        [
            leave_form.to_mongo(),
            petty_form.to_mongo(),
            services_form.to_mongo(),
            hire_form.to_mongo(),
        ]
    )

    # ---- Workflow: مرخصی
    leave_wf = Workflow(
        org_id=org.id,
        name="فرایند درخواست مرخصی",
        description="درخواست مرخصی کارمندان با تایید مدیر مستقیم",
        status="published",
        created_by=designer.id,
        nodes=[
            WorkflowNode(
                id="n1",
                type="trigger",
                label="شروع: ثبت درخواست",
                position={"x": 80, "y": 120},
                data={},
            ),
            WorkflowNode(
                id="n2",
                type="form",
                label="تکمیل فرم مرخصی",
                position={"x": 360, "y": 120},
                data={"form_id": leave_form.id, "assignee_role": "کارمند"},
            ),
            WorkflowNode(
                id="n3",
                type="approval",
                label="تایید مدیر تیم",
                position={"x": 640, "y": 120},
                data={"assignee_role": "مدیر"},
            ),
            WorkflowNode(
                id="n4",
                type="condition",
                label="بیش از ۳ روز؟",
                position={"x": 920, "y": 120},
                data={"expression": "duration > 3"},
            ),
            WorkflowNode(
                id="n5",
                type="approval",
                label="تایید ادمین سازمان",
                position={"x": 1200, "y": 40},
                data={"assignee_role": "مدیر"},
            ),
            WorkflowNode(
                id="n6",
                type="end",
                label="اعلام نتیجه",
                position={"x": 1200, "y": 220},
                data={},
            ),
        ],
        edges=[
            WorkflowEdge(id="e1", source="n1", target="n2"),
            WorkflowEdge(id="e2", source="n2", target="n3"),
            WorkflowEdge(id="e3", source="n3", target="n4"),
            WorkflowEdge(
                id="e4",
                source="n4",
                target="n5",
                label="بله",
                condition={"field_id": "_task_status", "op": "=", "value": "approved"},
            ),
            WorkflowEdge(id="e5", source="n4", target="n6", label="خیر"),
            WorkflowEdge(id="e6", source="n5", target="n6"),
        ],
    )

    # ---- Workflow: تنخواه (نمونه با شرط روی مبلغ)
    petty_amount_field_id = next(
        (f.id for f in petty_form.fields if f.label == "مبلغ (ریال)"), None
    )
    petty_wf = Workflow(
        org_id=org.id,
        name="فرایند درخواست تنخواه",
        description="تایید سطح اول، و در صورت مبلغ بیش از ۵٬۰۰۰٬۰۰۰ ریال تایید سطح دوم نیاز است.",
        status="published",
        created_by=designer.id,
        nodes=[
            WorkflowNode(
                id="n1",
                type="trigger",
                label="ثبت درخواست",
                position={"x": 80, "y": 180},
                data={},
            ),
            WorkflowNode(
                id="n2",
                type="form",
                label="تکمیل فرم تنخواه",
                position={"x": 320, "y": 180},
                data={"form_id": petty_form.id, "assignee_role": "کارمند"},
            ),
            WorkflowNode(
                id="n3",
                type="approval",
                label="تایید مدیر",
                position={"x": 580, "y": 180},
                data={"assignee_role": "مدیر"},
            ),
            WorkflowNode(
                id="n4",
                type="approval",
                label="تایید مالی (مبالغ بالا)",
                position={"x": 860, "y": 80},
                data={"assignee_role": "مدیر"},
            ),
            WorkflowNode(
                id="n5",
                type="task",
                label="پرداخت",
                position={"x": 1140, "y": 180},
                data={"assignee_role": "مدیر"},
            ),
            WorkflowNode(
                id="n6",
                type="end",
                label="پایان",
                position={"x": 1400, "y": 180},
                data={},
            ),
        ],
        edges=[
            WorkflowEdge(id="e1", source="n1", target="n2"),
            WorkflowEdge(id="e2", source="n2", target="n3"),
            # اگر مبلغ بیش از ۵٬۰۰۰٬۰۰۰ بود → تایید مالی
            WorkflowEdge(
                id="e3",
                source="n3",
                target="n4",
                label="مبلغ بالا",
                condition={
                    "field_id": petty_amount_field_id or "amount",
                    "op": ">",
                    "value": "5000000",
                },
            ),
            # در غیر این صورت مستقیم به پرداخت
            WorkflowEdge(id="e4", source="n3", target="n5", label="مبلغ عادی"),
            WorkflowEdge(id="e5", source="n4", target="n5"),
            WorkflowEdge(id="e6", source="n5", target="n6"),
        ],
    )

    # ---- Workflow: استخدام
    hire_wf = Workflow(
        org_id=org.id,
        name="فرایند استخدام نیروی جدید",
        description="روند بررسی و تایید استخدام نیروی جدید در سازمان",
        status="published",
        created_by=designer.id,
        nodes=[
            WorkflowNode(
                id="n1",
                type="trigger",
                label="شروع",
                position={"x": 50, "y": 150},
                data={},
            ),
            WorkflowNode(
                id="n2",
                type="form",
                label="تکمیل فرم مصاحبه",
                position={"x": 300, "y": 150},
                data={"form_id": hire_form.id, "assignee_role": "مدیر"},
            ),
            WorkflowNode(
                id="n3",
                type="approval",
                label="تایید منابع انسانی",
                position={"x": 550, "y": 150},
                data={"assignee_role": "مدیر"},
            ),
            WorkflowNode(
                id="n4",
                type="task",
                label="تنظیم قرارداد",
                position={"x": 800, "y": 50},
                data={"assignee_role": "کارمند"},
            ),
            WorkflowNode(
                id="n5",
                type="end",
                label="رد درخواست",
                position={"x": 800, "y": 250},
                data={},
            ),
            WorkflowNode(
                id="n6",
                type="end",
                label="پایان موفقیت‌آمیز",
                position={"x": 1050, "y": 50},
                data={},
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
                target="n5",
                label="رد",
                condition={"field_id": "_task_status", "op": "=", "value": "rejected"},
            ),
            WorkflowEdge(id="e5", source="n4", target="n6"),
        ],
    )

    await db.workflows.insert_many(
        [leave_wf.to_mongo(), petty_wf.to_mongo(), hire_wf.to_mongo()]
    )

    # ---- Sample running process instance + tasks ----
    now = datetime.now(timezone.utc)

    instance = ProcessInstance(
        org_id=org.id,
        workflow_id=leave_wf.id,
        workflow_name=leave_wf.name,
        started_by=employee.id,
        current_node_id="n3",
        status="running",
        context={"requester": employee.full_name},
    )

    completed_instance = ProcessInstance(
        org_id=org.id,
        workflow_id=petty_wf.id,
        workflow_name=petty_wf.name,
        started_by=manager.id,
        current_node_id="n6",
        status="completed",
        context={"requester": manager.full_name, "amount": 15000000},
    )

    rejected_instance = ProcessInstance(
        org_id=org.id,
        workflow_id=leave_wf.id,
        workflow_name=leave_wf.name,
        started_by=employee.id,
        current_node_id="n6",
        status="rejected",
        context={"requester": employee.full_name},
    )

    stuck_instance = ProcessInstance(
        org_id=org.id,
        workflow_id=hire_wf.id,
        workflow_name=hire_wf.name,
        started_by=designer.id,
        current_node_id="n3",
        status="stuck",
        context={"requester": designer.full_name, "applicant": "علی رضوی"},
    )

    await db.process_instances.insert_many(
        [
            instance.to_mongo(),
            completed_instance.to_mongo(),
            rejected_instance.to_mongo(),
            stuck_instance.to_mongo(),
        ]
    )

    tasks = [
        # Original tasks
        Task(
            org_id=org.id,
            process_id=instance.id,
            workflow_id=leave_wf.id,
            workflow_name=leave_wf.name,
            node_id="n3",
            title="تایید درخواست مرخصی سارا احمدی",
            assignee_id=manager.id,
            assignee_role="مدیر",
            type="approval",
            status="pending",
            priority="high",
            deadline=(now + timedelta(days=1)).isoformat(),
            description="مرخصی استحقاقی ۲ روزه از ۱۵ اسفند",
        ),
        Task(
            org_id=org.id,
            process_id=instance.id,
            workflow_id=petty_wf.id,
            workflow_name=petty_wf.name,
            node_id="n3",
            title="تایید تنخواه خرید ملزومات اداری",
            assignee_id=manager.id,
            assignee_role="مدیر",
            type="approval",
            status="pending",
            priority="medium",
            deadline=(now + timedelta(days=3)).isoformat(),
            description="مبلغ ۸,۵۰۰,۰۰۰ ریال",
        ),
        Task(
            org_id=org.id,
            process_id=instance.id,
            workflow_id=leave_wf.id,
            workflow_name=leave_wf.name,
            node_id="n2",
            title="تکمیل فرم درخواست آموزش",
            assignee_id=employee.id,
            assignee_role="کارمند",
            type="form",
            status="in_progress",
            priority="low",
            form_id=leave_form.id,
            deadline=(now + timedelta(days=5)).isoformat(),
            description="ثبت درخواست شرکت در دوره آموزشی",
        ),
        Task(
            org_id=org.id,
            process_id=instance.id,
            workflow_id=petty_wf.id,
            workflow_name=petty_wf.name,
            node_id="n4",
            title="پرداخت تنخواه تایید‌شده",
            assignee_id=admin.id,
            assignee_role="مدیر",
            type="task",
            status="pending",
            priority="urgent",
            deadline=(now + timedelta(hours=8)).isoformat(),
            description="پرداخت مالی پس از تایید",
        ),
        # New tasks for completed instance
        Task(
            org_id=org.id,
            process_id=completed_instance.id,
            workflow_id=petty_wf.id,
            workflow_name=petty_wf.name,
            node_id="n5",
            title="پرداخت تنخواه انجام شد",
            assignee_id=admin.id,
            assignee_role="مدیر",
            type="task",
            status="done",
            priority="high",
            deadline=(now - timedelta(days=2)).isoformat(),
            description="مبلغ پرداخت و رسید بایگانی شد.",
        ),
        # New task for rejected instance
        Task(
            org_id=org.id,
            process_id=rejected_instance.id,
            workflow_id=leave_wf.id,
            workflow_name=leave_wf.name,
            node_id="n3",
            title="رد درخواست مرخصی",
            assignee_id=manager.id,
            assignee_role="مدیر",
            type="approval",
            status="rejected",
            priority="medium",
            deadline=(now - timedelta(days=1)).isoformat(),
            description="مرخصی به دلیل ترافیک کاری رد شد.",
        ),
        # New task for stuck instance
        Task(
            org_id=org.id,
            process_id=stuck_instance.id,
            workflow_id=hire_wf.id,
            workflow_name=hire_wf.name,
            node_id="n3",
            title="نیاز به تایید منابع انسانی (خطا)",
            assignee_id=admin.id,
            assignee_role="مدیر",
            type="approval",
            status="in_progress",
            priority="urgent",
            deadline=(now - timedelta(days=3)).isoformat(),
            description="ارتباط با سرور ایمیل قطع شده است.",
        ),
    ]
    await db.tasks.insert_many([t.to_mongo() for t in tasks])

    # ---- Activities
    activities = [
        {
            "id": new_id(),
            "org_id": org.id,
            "actor_id": employee.id,
            "actor_name": employee.full_name,
            "action": "process.started",
            "target_type": "process",
            "target_id": instance.id,
            "summary": "فرایند درخواست مرخصی آغاز شد",
            "created_at": now_iso(),
            "updated_at": now_iso(),
        },
        {
            "id": new_id(),
            "org_id": org.id,
            "actor_id": designer.id,
            "actor_name": designer.full_name,
            "action": "workflow.published",
            "target_type": "workflow",
            "target_id": leave_wf.id,
            "summary": "فرایند درخواست مرخصی منتشر شد",
            "created_at": now_iso(),
            "updated_at": now_iso(),
        },
        {
            "id": new_id(),
            "org_id": org.id,
            "actor_id": manager.id,
            "actor_name": manager.full_name,
            "action": "task.approved",
            "target_type": "task",
            "target_id": new_id(),
            "summary": "درخواست مرخصی تایید شد",
            "created_at": now_iso(),
            "updated_at": now_iso(),
        },
        {
            "id": new_id(),
            "org_id": org.id,
            "actor_id": manager.id,
            "actor_name": manager.full_name,
            "action": "process.completed",
            "target_type": "process",
            "target_id": completed_instance.id,
            "summary": "فرایند تنخواه با موفقیت به پایان رسید",
            "created_at": now_iso(),
            "updated_at": now_iso(),
        },
        {
            "id": new_id(),
            "org_id": org.id,
            "actor_id": manager.id,
            "actor_name": manager.full_name,
            "action": "task.rejected",
            "target_type": "task",
            "target_id": rejected_instance.id,
            "summary": "درخواست مرخصی رد شد",
            "created_at": now_iso(),
            "updated_at": now_iso(),
        },
    ]
    await db.activities.insert_many(activities)

    # ---- Comments
    comments = [
        Comment(
            org_id=org.id,
            target_type="process",
            target_id=instance.id,
            author_id=manager.id,
            author_name=manager.full_name,
            body="لطفا در اسرع وقت بررسی شود. ممنون.",
        ),
        Comment(
            org_id=org.id,
            target_type="task",
            target_id=tasks[0].id,
            author_id=admin.id,
            author_name=admin.full_name,
            body="نیاز به مستندات بیشتر دارد. فرم را اصلاح کنید.",
        ),
    ]
    await db.comments.insert_many([c.to_mongo() for c in comments])

    # ---- Chat Messages (AI interaction)
    session_id = new_id()
    chats = [
        ChatMessage(
            org_id=org.id,
            session_id=session_id,
            user_id=designer.id,
            role="user",
            content="یک فرایند برای ثبت‌نام در دوره‌های آموزشی بساز",
        ),
        ChatMessage(
            org_id=org.id,
            session_id=session_id,
            user_id=designer.id,
            role="assistant",
            content="بسیار خب، فرایند پیشنهادی با موفقیت ایجاد شد.",
            generated_workflow={"name": "ثبت‌نام دوره آموزشی", "nodes": []},
        ),
    ]
    await db.chat_messages.insert_many([c.to_mongo() for c in chats])

    return {"status": "seeded", "org_id": org.id}


if __name__ == "__main__":
    print(asyncio.run(seed()))
