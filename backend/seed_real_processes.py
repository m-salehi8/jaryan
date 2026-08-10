"""Seed three real organisational processes (from customer .docx files) into Mongo.

Idempotent: deletes any previously seeded copies (by name) for the org, then
recreates the forms + published workflows. Roles are mapped to the two roles
the system supports: approvers/managers -> "مدیر", requesters/executors -> "کارمند".
"""

from __future__ import annotations

import asyncio

from db import db, new_id
from models import Form, FormField, Workflow, WorkflowEdge, WorkflowNode


def F(**kw) -> FormField:
    kw.setdefault("id", new_id())
    return FormField(**kw)


def role(node_role: str) -> dict:
    return {"assignee_type": "role", "assignee_role": node_role}


def form_role(form_id: str, node_role: str = "کارمند") -> dict:
    return {"assignee_type": "role", "assignee_role": node_role, "form_id": form_id}


APPROVED = {"field_id": "_task_status", "op": "=", "value": "approved"}
REJECTED = {"field_id": "_task_status", "op": "=", "value": "rejected"}


async def run() -> dict:
    org = await db.organizations.find_one({"slug": {"$in": ["jaryan", "raahkar"]}}, {"_id": 0})
    if not org:
        return {"status": "no_org"}
    org_id = org["id"]
    admin = await db.users.find_one({"org_id": org_id, "email": "admin@jaryan.ir"}, {"_id": 0})
    creator = admin["id"] if admin else new_id()

    wf_names = [
        "فرایند درخواست تأمین کالا و تجهیزات",
        "فرایند میز خدمت امور اداری و سرمایه انسانی",
        "فرایند جذب نیروی انسانی",
    ]
    form_names = [
        "فرم درخواست تأمین کالا و تجهیزات",
        "فرم میز خدمت سرمایه انسانی",
        "فرم درخواست جذب نیروی انسانی",
    ]
    await db.workflows.delete_many({"org_id": org_id, "name": {"$in": wf_names}})
    await db.forms.delete_many({"org_id": org_id, "name": {"$in": form_names}})

    # ---------------- Form 1: procurement ----------------
    budget_field = F(type="number", label="بودجه پیش‌بینی‌شده (ریال)", required=True)
    kind_field = F(type="select", label="نوع کالا", required=True,
                   options=["مصرفی", "سرمایه‌ای", "فناوری اطلاعات (IT)"])
    procurement_form = Form(
        org_id=org_id, name=form_names[0], created_by=creator,
        description="فرم ثبت درخواست تأمین کالا و تجهیزات",
        fields=[
            F(type="heading", label="مشخصات درخواست"),
            F(type="text", label="شرح نیاز", required=True),
            kind_field,
            F(type="number", label="مقدار", required=True),
            F(type="text", label="واحد", placeholder="مثلاً عدد / دستگاه"),
            F(type="select", label="اولویت", options=["عادی", "مهم", "فوری"], required=True),
            F(type="textarea", label="دلیل درخواست", required=True),
            F(type="textarea", label="مشخصات فنی"),
            budget_field,
        ],
    )

    # ---------------- Form 2: HR service desk ----------------
    service_type = F(type="select", label="نوع درخواست", required=True, options=[
        "اعلام مدرک تحصیلی جدید", "حق اولاد", "حق عائله‌مندی", "عکس پرسنلی",
        "بیمه تکمیلی", "تردد / مرخصی / مأموریت", "رفاهیات", "درخواست احکام",
        "کیف پول بله", "خدمات کارت پیام", "درخواست مرتبط با غذا سازمانی",
    ])
    service_form = Form(
        org_id=org_id, name=form_names[1], created_by=creator,
        description="فرم درخواست خدمات اداری و سرمایه انسانی (میز خدمت)",
        fields=[
            F(type="heading", label="اطلاعات درخواست"),
            service_type,
            F(type="text", label="کد پرسنلی"),
            F(type="textarea", label="توضیحات", required=True),
            F(type="file", label="مدارک پیوست"),
        ],
    )

    # ---------------- Form 3: recruitment ----------------
    recruit_form = Form(
        org_id=org_id, name=form_names[2], created_by=creator,
        description="فرم ثبت درخواست جذب نیروی انسانی",
        fields=[
            F(type="heading", label="مشخصات موقعیت شغلی"),
            F(type="text", label="عنوان شغل", required=True),
            F(type="text", label="واحد متقاضی", required=True),
            F(type="number", label="تعداد نیروی موردنیاز", required=True),
            F(type="select", label="نوع همکاری", required=True,
              options=["تمام‌وقت", "پاره‌وقت", "پروژه‌ای", "قراردادی"]),
            F(type="textarea", label="شرح وظایف و دلایل نیاز", required=True),
        ],
    )

    await db.forms.insert_many([
        procurement_form.to_mongo(), service_form.to_mongo(), recruit_form.to_mongo()
    ])

    # ================= Workflow 1: Procurement =================
    procurement_wf = Workflow(
        org_id=org_id, name=wf_names[0], status="published", created_by=creator,
        description="درخواست تأمین کالا/تجهیزات با تاییدهای مدیر، فناوری اطلاعات و پشتیبانی؛ تعیین نوع خرید بر اساس مبلغ (خرید مستقیم یا مناقصه).",
        nodes=[
            WorkflowNode(id="n1", type="trigger", label="ثبت درخواست", position={"x": 60, "y": 200}),
            WorkflowNode(id="n2", type="form", label="تکمیل فرم درخواست", position={"x": 280, "y": 200}, data=form_role(procurement_form.id)),
            WorkflowNode(id="n3", type="approval", label="تایید مدیر مافوق", position={"x": 520, "y": 200}, data=role("مدیر")),
            WorkflowNode(id="n4", type="approval", label="بررسی و تایید فناوری اطلاعات و امنیت", position={"x": 760, "y": 200}, data=role("مدیر")),
            WorkflowNode(id="n5", type="approval", label="تایید مدیرکل پشتیبانی", position={"x": 1000, "y": 200}, data=role("مدیر")),
            WorkflowNode(id="n6", type="task", label="استعلام قیمت (کارشناس خرید)", position={"x": 1240, "y": 200}, data=role("کارمند")),
            WorkflowNode(id="n7", type="condition", label="تعیین نوع خرید بر اساس مبلغ", position={"x": 1480, "y": 200}),
            WorkflowNode(id="n8", type="task", label="خرید مستقیم (معاملات خرد/متوسط)", position={"x": 1720, "y": 100}, data=role("کارمند")),
            WorkflowNode(id="n9", type="task", label="برگزاری مناقصه (مبالغ بالا)", position={"x": 1720, "y": 320}, data=role("کارمند")),
            WorkflowNode(id="n10", type="task", label="تحویل کالا و ثبت اموال", position={"x": 1980, "y": 200}, data=role("کارمند")),
            WorkflowNode(id="n11", type="end", label="پایان موفق", position={"x": 2220, "y": 200}),
            WorkflowNode(id="n12", type="end", label="رد درخواست", position={"x": 760, "y": 420}),
        ],
        edges=[
            WorkflowEdge(id="e1", source="n1", target="n2"),
            WorkflowEdge(id="e2", source="n2", target="n3"),
            WorkflowEdge(id="e3", source="n3", target="n4", label="تایید", condition=APPROVED),
            WorkflowEdge(id="e3r", source="n3", target="n12", label="رد", condition=REJECTED),
            WorkflowEdge(id="e4", source="n4", target="n5", label="تایید", condition=APPROVED),
            WorkflowEdge(id="e4r", source="n4", target="n12", label="رد", condition=REJECTED),
            WorkflowEdge(id="e5", source="n5", target="n6", label="تایید", condition=APPROVED),
            WorkflowEdge(id="e5r", source="n5", target="n12", label="رد", condition=REJECTED),
            WorkflowEdge(id="e6", source="n6", target="n7"),
            WorkflowEdge(id="e7", source="n7", target="n9", label="مبلغ بالا (مناقصه)",
                         condition={"field_id": budget_field.id, "op": ">", "value": "5000000000"}),
            WorkflowEdge(id="e8", source="n7", target="n8", label="خرید مستقیم"),
            WorkflowEdge(id="e9", source="n8", target="n10"),
            WorkflowEdge(id="e10", source="n9", target="n10"),
            WorkflowEdge(id="e11", source="n10", target="n11"),
        ],
    )

    # ================= Workflow 2: HR service desk =================
    service_wf = Workflow(
        org_id=org_id, name=wf_names[1], status="published", created_by=creator,
        description="میز خدمت سرمایه انسانی: ثبت درخواست، بررسی کارشناس، تایید رئیس اداره، و مسیر ویژه برای درخواست‌های مرتبط با غذای سازمانی.",
        nodes=[
            WorkflowNode(id="n1", type="trigger", label="ثبت درخواست", position={"x": 60, "y": 200}),
            WorkflowNode(id="n2", type="form", label="انتخاب و تکمیل درخواست", position={"x": 300, "y": 200}, data=form_role(service_form.id)),
            WorkflowNode(id="n3", type="task", label="بررسی توسط کارشناس سرمایه انسانی", position={"x": 560, "y": 200}, data=role("کارمند")),
            WorkflowNode(id="n4", type="approval", label="تایید رئیس اداره سرمایه انسانی", position={"x": 820, "y": 200}, data=role("مدیر")),
            WorkflowNode(id="n5", type="condition", label="مربوط به غذای سازمانی؟", position={"x": 1080, "y": 200}),
            WorkflowNode(id="n6", type="task", label="فعال/غیرفعال‌سازی حق غذا (مالی/پشتیبانی)", position={"x": 1340, "y": 80}, data=role("کارمند")),
            WorkflowNode(id="n7", type="task", label="انجام و نهایی‌سازی درخواست", position={"x": 1340, "y": 320}, data=role("کارمند")),
            WorkflowNode(id="n8", type="end", label="اعلام نتیجه و پایان", position={"x": 1620, "y": 200}),
            WorkflowNode(id="n9", type="end", label="رد درخواست", position={"x": 820, "y": 400}),
        ],
        edges=[
            WorkflowEdge(id="e1", source="n1", target="n2"),
            WorkflowEdge(id="e2", source="n2", target="n3"),
            WorkflowEdge(id="e3", source="n3", target="n4"),
            WorkflowEdge(id="e4", source="n4", target="n5", label="تایید", condition=APPROVED),
            WorkflowEdge(id="e4r", source="n4", target="n9", label="رد", condition=REJECTED),
            WorkflowEdge(id="e5", source="n5", target="n6", label="مرتبط با غذا",
                         condition={"field_id": service_type.id, "op": "=", "value": "درخواست مرتبط با غذا سازمانی"}),
            WorkflowEdge(id="e6", source="n5", target="n7", label="سایر خدمات"),
            WorkflowEdge(id="e7", source="n6", target="n7"),
            WorkflowEdge(id="e8", source="n7", target="n8"),
        ],
    )

    # ================= Workflow 3: Recruitment =================
    recruit_wf = Workflow(
        org_id=org_id, name=wf_names[2], status="published", created_by=creator,
        description="جذب نیرو: درخواست واحد، تاییدهای مدیر مافوق و معاون، بررسی مدارک، تایید سرمایه انسانی، استعلام صلاحیت (حراست)، عقد قرارداد و آنبوردینگ.",
        nodes=[
            WorkflowNode(id="n1", type="trigger", label="ثبت درخواست جذب", position={"x": 60, "y": 220}),
            WorkflowNode(id="n2", type="form", label="تکمیل فرم درخواست جذب", position={"x": 300, "y": 220}, data=form_role(recruit_form.id)),
            WorkflowNode(id="n3", type="approval", label="تایید مدیر مافوق", position={"x": 560, "y": 220}, data=role("مدیر")),
            WorkflowNode(id="n4", type="approval", label="تایید معاون برنامه‌ریزی و توسعه", position={"x": 820, "y": 220}, data=role("مدیر")),
            WorkflowNode(id="n5", type="task", label="بررسی و تکمیل مدارک (کارشناس سرمایه انسانی)", position={"x": 1080, "y": 220}, data=role("کارمند")),
            WorkflowNode(id="n6", type="approval", label="تایید رئیس اداره سرمایه انسانی", position={"x": 1340, "y": 220}, data=role("مدیر")),
            WorkflowNode(id="n7", type="task", label="استعلام و تعیین صلاحیت (حراست)", position={"x": 1600, "y": 220}, data=role("کارمند")),
            WorkflowNode(id="n8", type="approval", label="اعلام نتیجه استعلام (مدیرکل حراست)", position={"x": 1860, "y": 220}, data=role("مدیر")),
            WorkflowNode(id="n9", type="task", label="عقد قرارداد و شروع همکاری", position={"x": 2120, "y": 220}, data=role("مدیر")),
            WorkflowNode(id="n10", type="task", label="ایجاد دسترسی‌ها و آنبوردینگ", position={"x": 2380, "y": 220}, data=role("کارمند")),
            WorkflowNode(id="n11", type="end", label="پایان و اطلاع‌رسانی جذب", position={"x": 2640, "y": 220}),
            WorkflowNode(id="n12", type="end", label="رد / عدم تایید درخواست", position={"x": 820, "y": 440}),
        ],
        edges=[
            WorkflowEdge(id="e1", source="n1", target="n2"),
            WorkflowEdge(id="e2", source="n2", target="n3"),
            WorkflowEdge(id="e3", source="n3", target="n4", label="تایید", condition=APPROVED),
            WorkflowEdge(id="e3r", source="n3", target="n12", label="رد", condition=REJECTED),
            WorkflowEdge(id="e4", source="n4", target="n5", label="تایید", condition=APPROVED),
            WorkflowEdge(id="e4r", source="n4", target="n12", label="رد", condition=REJECTED),
            WorkflowEdge(id="e5", source="n5", target="n6"),
            WorkflowEdge(id="e6", source="n6", target="n7", label="تایید", condition=APPROVED),
            WorkflowEdge(id="e6r", source="n6", target="n12", label="رد", condition=REJECTED),
            WorkflowEdge(id="e7", source="n7", target="n8"),
            WorkflowEdge(id="e8", source="n8", target="n9", label="تایید صلاحیت", condition=APPROVED),
            WorkflowEdge(id="e8r", source="n8", target="n12", label="عدم صلاحیت", condition=REJECTED),
            WorkflowEdge(id="e9", source="n9", target="n10"),
            WorkflowEdge(id="e10", source="n10", target="n11"),
        ],
    )

    await db.workflows.insert_many([
        procurement_wf.to_mongo(), service_wf.to_mongo(), recruit_wf.to_mongo()
    ])

    return {
        "status": "seeded",
        "org_id": org_id,
        "workflows": wf_names,
        "forms": form_names,
    }


if __name__ == "__main__":
    print(asyncio.run(run()))
