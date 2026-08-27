import asyncio
import os
import random
import uuid
from datetime import datetime, timedelta, timezone

from django.core.management.base import BaseCommand
from django.db import transaction

from core.models import Organization, User, Department, Workflow, Form, Task
from core.mongo import get_db

def new_id():
    return str(uuid.uuid4())

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def F(**kw):
    kw.setdefault("id", new_id())
    return kw

def role(node_role: str):
    return {"assignee_type": "role", "assignee_role": node_role}

def form_role(form_id: str, node_role: str = "کارمند"):
    return {"assignee_type": "role", "assignee_role": node_role, "form_id": form_id}

class Command(BaseCommand):
    help = 'Seed the database with organization, users, workflows, forms, and process instances.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--scenario',
            type=str,
            default='all',
            help='Scenario to run: basic, real, ai, heavy, or all'
        )

    def handle(self, *args, **options):
        scenario = options['scenario']
        self.stdout.write(f"Starting seed with scenario: {scenario}...")
        
        # Clear existing Django data
        Task.objects.all().delete()
        Workflow.objects.all().delete()
        Form.objects.all().delete()
        User.objects.all().delete()
        Organization.objects.all().delete()
        
        # Clear existing Mongo data
        asyncio.run(self.clear_mongo())

        org = Organization.objects.create(slug="jaryan", name="سازمان نمونه روند")
        
        users_data = [
            ("admin@jaryan.ir", "آرش رضایی", "مدیر", "#171717"),
            ("designer@jaryan.ir", "نگار محمدی", "مدیر", "#525252"),
            ("manager@jaryan.ir", "حسین کریمی", "مدیر", "#737373"),
            ("employee@jaryan.ir", "سارا احمدی", "کارمند", "#a3a3a3"),
        ]
        
        users = {}
        for email, name, role_str, color in users_data:
            u = User.objects.create_user(
                email=email,
                full_name=name,
                role=role_str,
                password="1234",
                avatar_color=color,
                org=org
            )
            users[email] = u
        
        admin = users["admin@jaryan.ir"]
        designer = users["designer@jaryan.ir"]
        manager = users["manager@jaryan.ir"]
        employee = users["employee@jaryan.ir"]

        if scenario in ['all', 'basic']:
            self._seed_basic(org, designer, admin, manager, employee)
            
        if scenario in ['all', 'real']:
            self._seed_real_processes(org, designer)

        if scenario in ['all', 'ai']:
            self._seed_ai_workflow(org, designer)
            
        if scenario in ['all', 'heavy']:
            self._seed_heavy(org, users)
            
        self.stdout.write(self.style.SUCCESS(f'Successfully seeded data!'))

    async def clear_mongo(self):
        db = get_db()
        await db.process_instances.delete_many({})
        await db.activities.delete_many({})
        await db.comments.delete_many({})
        await db.chat_messages.delete_many({})
        
    async def insert_mongo_docs(self, collection_name, docs):
        db = get_db()
        if docs:
            await db[collection_name].insert_many(docs)

    def _seed_basic(self, org, designer, admin, manager, employee):
        leave_form = Form.objects.create(
            org=org, name="فرم درخواست مرخصی", created_by=designer,
            description="فرم استاندارد برای ثبت درخواست مرخصی کارکنان",
            fields=[
                {"id": new_id(), "type": "heading", "label": "اطلاعات درخواست مرخصی"},
                {"id": new_id(), "type": "select", "label": "نوع مرخصی", "required": True, "options": ["استحقاقی", "استعلاجی", "بدون حقوق", "ساعتی"]},
                {"id": new_id(), "type": "date", "label": "تاریخ شروع", "required": True},
                {"id": new_id(), "type": "date", "label": "تاریخ پایان", "required": True},
                {"id": new_id(), "type": "textarea", "label": "توضیحات", "placeholder": "دلیل درخواست را وارد کنید"}
            ]
        )
        
        petty_form = Form.objects.create(
            org=org, name="فرم درخواست تنخواه", created_by=designer,
            description="درخواست تنخواه برای هزینه‌های جاری",
            fields=[
                {"id": new_id(), "type": "heading", "label": "اطلاعات تنخواه"},
                {"id": new_id(), "type": "text", "label": "عنوان درخواست", "required": True},
                {"id": new_id(), "type": "number", "label": "مبلغ (ریال)", "required": True},
                {"id": new_id(), "type": "textarea", "label": "شرح مصرف", "required": True}
            ]
        )

        petty_amount_field_id = next((f["id"] for f in petty_form.fields if f["label"] == "مبلغ (ریال)"), None)

        leave_wf = Workflow.objects.create(
            org=org, name="فرایند درخواست مرخصی", created_by=designer,
            description="درخواست مرخصی کارمندان با تایید مدیر مستقیم", status="published",
            nodes=[
                {"id": "n1", "type": "trigger", "label": "شروع: ثبت درخواست", "position": {"x": 80, "y": 120}, "data": {}},
                {"id": "n2", "type": "form", "label": "تکمیل فرم مرخصی", "position": {"x": 360, "y": 120}, "data": {"form_id": str(leave_form.id), "assignee_role": "کارمند"}},
                {"id": "n3", "type": "approval", "label": "تایید مدیر تیم", "position": {"x": 640, "y": 120}, "data": {"assignee_role": "مدیر"}},
                {"id": "n4", "type": "condition", "label": "بیش از ۳ روز؟", "position": {"x": 920, "y": 120}, "data": {"expression": "duration > 3"}},
                {"id": "n5", "type": "approval", "label": "تایید ادمین سازمان", "position": {"x": 1200, "y": 40}, "data": {"assignee_role": "مدیر"}},
                {"id": "n6", "type": "end", "label": "اعلام نتیجه", "position": {"x": 1200, "y": 220}, "data": {}},
            ],
            edges=[
                {"id": "e1", "source": "n1", "target": "n2"},
                {"id": "e2", "source": "n2", "target": "n3"},
                {"id": "e3", "source": "n3", "target": "n4"},
                {"id": "e4", "source": "n4", "target": "n5", "label": "بله", "condition": {"field_id": "_task_status", "op": "=", "value": "approved"}},
                {"id": "e5", "source": "n4", "target": "n6", "label": "خیر"},
                {"id": "e6", "source": "n5", "target": "n6"},
            ]
        )

        petty_wf = Workflow.objects.create(
            org=org, name="فرایند درخواست تنخواه", created_by=designer,
            description="تایید سطح اول، و در صورت مبلغ بیش از ۵٬۰۰۰٬۰۰۰ ریال تایید سطح دوم نیاز است.", status="published",
            nodes=[
                {"id": "n1", "type": "trigger", "label": "ثبت درخواست", "position": {"x": 80, "y": 180}, "data": {}},
                {"id": "n2", "type": "form", "label": "تکمیل فرم تنخواه", "position": {"x": 320, "y": 180}, "data": {"form_id": str(petty_form.id), "assignee_role": "کارمند"}},
                {"id": "n3", "type": "approval", "label": "تایید مدیر", "position": {"x": 580, "y": 180}, "data": {"assignee_role": "مدیر"}},
                {"id": "n4", "type": "approval", "label": "تایید مالی (مبالغ بالا)", "position": {"x": 860, "y": 80}, "data": {"assignee_role": "مدیر"}},
                {"id": "n5", "type": "task", "label": "پرداخت", "position": {"x": 1140, "y": 180}, "data": {"assignee_role": "مدیر"}},
                {"id": "n6", "type": "end", "label": "پایان", "position": {"x": 1400, "y": 180}, "data": {}},
            ],
            edges=[
                {"id": "e1", "source": "n1", "target": "n2"},
                {"id": "e2", "source": "n2", "target": "n3"},
                {"id": "e3", "source": "n3", "target": "n4", "label": "مبلغ بالا", "condition": {"field_id": petty_amount_field_id or "amount", "op": ">", "value": "5000000"}},
                {"id": "e4", "source": "n3", "target": "n5", "label": "مبلغ عادی"},
                {"id": "e5", "source": "n4", "target": "n5"},
                {"id": "e6", "source": "n5", "target": "n6"},
            ]
        )

        now = datetime.now(timezone.utc)
        
        pi1 = {"_id": new_id(), "org_id": str(org.id), "workflow_id": str(leave_wf.id), "workflow_name": leave_wf.name, "started_by": str(employee.id), "current_node_id": "n3", "status": "running", "context": {"requester": employee.full_name}, "created_at": now_iso(), "updated_at": now_iso()}
        pi2 = {"_id": new_id(), "org_id": str(org.id), "workflow_id": str(petty_wf.id), "workflow_name": petty_wf.name, "started_by": str(manager.id), "current_node_id": "n6", "status": "completed", "context": {"requester": manager.full_name, "amount": 15000000}, "created_at": now_iso(), "updated_at": now_iso()}

        asyncio.run(self.insert_mongo_docs("process_instances", [pi1, pi2]))

        Task.objects.create(org=org, workflow=leave_wf, process_instance_id=pi1["_id"], node_id="n3", assigned_to=manager, status="pending")
        Task.objects.create(org=org, workflow=petty_wf, process_instance_id=pi2["_id"], node_id="n5", assigned_to=admin, status="done")

    def _seed_real_processes(self, org, designer):
        APPROVED = {"field_id": "_task_status", "op": "=", "value": "approved"}
        REJECTED = {"field_id": "_task_status", "op": "=", "value": "rejected"}
        
        budget_field = F(type="number", label="بودجه پیش‌بینی‌شده (ریال)", required=True)
        kind_field = F(type="select", label="نوع کالا", required=True, options=["مصرفی", "سرمایه‌ای", "فناوری اطلاعات (IT)"])
        procurement_form = Form.objects.create(
            org=org, name="فرم درخواست تأمین کالا و تجهیزات", created_by=designer,
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
            ]
        )

        Workflow.objects.create(
            org=org, name="فرایند درخواست تأمین کالا و تجهیزات", status="published", created_by=designer,
            description="درخواست تأمین کالا/تجهیزات با تاییدهای مدیر، فناوری اطلاعات و پشتیبانی.",
            nodes=[
                {"id": "n1", "type": "trigger", "label": "ثبت درخواست", "position": {"x": 60, "y": 200}},
                {"id": "n2", "type": "form", "label": "تکمیل فرم درخواست", "position": {"x": 280, "y": 200}, "data": form_role(str(procurement_form.id))},
                {"id": "n3", "type": "approval", "label": "تایید مدیر مافوق", "position": {"x": 520, "y": 200}, "data": role("مدیر")},
                {"id": "n4", "type": "approval", "label": "بررسی فناوری اطلاعات", "position": {"x": 760, "y": 200}, "data": role("مدیر")},
                {"id": "n5", "type": "task", "label": "خرید مستقیم (معاملات خرد/متوسط)", "position": {"x": 1000, "y": 200}, "data": role("کارمند")},
                {"id": "n6", "type": "end", "label": "پایان", "position": {"x": 1240, "y": 200}},
            ],
            edges=[
                {"id": "e1", "source": "n1", "target": "n2"},
                {"id": "e2", "source": "n2", "target": "n3"},
                {"id": "e3", "source": "n3", "target": "n4", "label": "تایید", "condition": APPROVED},
                {"id": "e4", "source": "n4", "target": "n5", "label": "تایید", "condition": APPROVED},
                {"id": "e5", "source": "n5", "target": "n6"},
            ]
        )

    def _seed_ai_workflow(self, org, designer):
        Workflow.objects.create(
            org=org, name="تنخواه هوشمند", status="published", created_by=designer,
            description="فرایند هوشمند بررسی فاکتور خرید با استفاده از OCR و عامل هوش مصنوعی.",
            nodes=[
                {"id": "n1", "type": "trigger", "label": "ثبت فاکتور", "position": {"x": 50, "y": 150}, "data": {}},
                {"id": "n2", "type": "ocr_task", "label": "استخراج دیتای فاکتور", "position": {"x": 250, "y": 150}, "data": {"source_file_variable": "{{receipt_image}}", "extraction_prompt": "Extract the 'total_amount' as a number, and 'vendor_name' as a string from this receipt. Return ONLY valid JSON.", "output_key": "ocr_result"}},
                {"id": "n3", "type": "ai_task", "label": "بررسی منطق خرید", "position": {"x": 480, "y": 150}, "data": {"system_prompt": "You are a finance assistant. Evaluate if the purchase is strictly related to 'office supplies'. Reply with JSON containing a boolean 'approved' and string 'reason'.", "output_key": "ai_evaluation"}},
                {"id": "n4", "type": "condition", "label": "تصمیم‌گیری", "position": {"x": 720, "y": 150}, "data": {"expression": "ai_evaluation.approved == true"}},
                {"id": "n5", "type": "approval", "label": "تایید نهایی توسط انسان", "position": {"x": 950, "y": 50}, "data": {"assignee_role": "مدیر"}},
                {"id": "n6", "type": "end", "label": "پایان", "position": {"x": 1200, "y": 50}, "data": {}},
            ],
            edges=[
                {"id": "e1", "source": "n1", "target": "n2"},
                {"id": "e2", "source": "n2", "target": "n3"},
                {"id": "e3", "source": "n3", "target": "n4"},
                {"id": "e4", "source": "n4", "target": "n5", "label": "تایید AI", "condition": {"field_id": "ai_evaluation.approved", "op": "=", "value": "true"}},
                {"id": "e6", "source": "n5", "target": "n6"},
            ]
        )

    def _seed_heavy(self, org, users_map):
        pass # Optional generation for heavy dataset if requested
