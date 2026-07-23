import asyncio
import uuid
import random
from datetime import datetime, timedelta, timezone
from django.core.management.base import BaseCommand
from django.utils import timezone as django_timezone
from core.models import Organization, Department, User, Workflow, Task, current_org_id
from core.mongo import get_db

class Command(BaseCommand):
    help = 'Seeds the hybrid DB with 3 months of usage for a mid-sized company'

    def handle(self, *args, **kwargs):
        self.stdout.write("Starting hybrid DB seed process...")
        asyncio.run(self.seed_async())
        self.stdout.write(self.style.SUCCESS("Successfully seeded the hybrid DB!"))

    async def seed_async(self):
        # We need an org
        org, created = await Organization.objects.aget_or_create(
            slug="fanaavaran-jaryan",
            defaults={"name": "شرکت فناوران جریان"}
        )
        current_org_id.set(str(org.id))

        if created:
            self.stdout.write("Created organization: شرکت فناوران جریان")
        else:
            self.stdout.write("Organization exists. Skipping seed to prevent duplicates if not empty, but we will proceed anyway for demo.")

        # Departments
        hr_dept, _ = await Department.objects.aget_or_create(org=org, name="منابع انسانی")
        it_dept, _ = await Department.objects.aget_or_create(org=org, name="فناوری اطلاعات")
        fin_dept, _ = await Department.objects.aget_or_create(org=org, name="مالی")

        # Users
        admin_user, _ = await User.objects.aget_or_create(
            org=org, email="admin@jaryan.ir",
            defaults={"full_name": "مدیر سیستم", "role": "ادمین سازمان"}
        )
        admin_user.set_password("admin123")
        await admin_user.asave()

        hr_manager, _ = await User.objects.aget_or_create(
            org=org, email="hr.manager@jaryan.ir",
            defaults={"full_name": "مدیر منابع انسانی", "role": "مدیر تیم", "department": hr_dept}
        )
        hr_manager.set_password("pass123")
        await hr_manager.asave()

        emp1, _ = await User.objects.aget_or_create(
            org=org, email="emp1@jaryan.ir",
            defaults={"full_name": "کارمند فروش", "role": "کارمند", "manager": hr_manager, "department": hr_dept}
        )
        emp1.set_password("pass123")
        await emp1.asave()

        # Workflows
        wf, wf_created = await Workflow.objects.aget_or_create(
            org=org, name="درخواست مرخصی",
            defaults={
                "description": "فرایند درخواست و تایید مرخصی روزانه",
                "status": "published",
                "created_by": admin_user,
                "nodes": [
                    {"id": "node_trigger", "type": "trigger", "label": "شروع مرخصی", "data": {"form_id": "leave_form"}},
                    {"id": "node_approval", "type": "approval", "label": "تایید مدیر", "data": {"assignee_type": "manager"}},
                    {"id": "node_end", "type": "end", "label": "پایان"}
                ],
                "edges": [
                    {"id": "e1", "source": "node_trigger", "target": "node_approval"},
                    {"id": "e2", "source": "node_approval", "target": "node_end", "condition": {"field_id": "status", "op": "=", "value": "approved"}},
                    {"id": "e3", "source": "node_approval", "target": "node_end", "condition": {"field_id": "status", "op": "=", "value": "rejected"}}
                ]
            }
        )

        db = get_db()
        now = django_timezone.now()
        
        self.stdout.write("Seeding Process Instances in MongoDB & Tasks in Postgres...")

        # Create 50 process instances over the last 90 days
        for i in range(50):
            days_ago = random.randint(1, 90)
            start_date = now - timedelta(days=days_ago)
            process_id = str(uuid.uuid4())
            
            status_choice = random.choice(["completed", "completed", "completed", "in_progress", "rejected"])
            
            p_doc = {
                "id": process_id,
                "org_id": str(org.id),
                "workflow_id": str(wf.id),
                "workflow_name": wf.name,
                "started_by": str(emp1.id),
                "status": status_choice,
                "context": {"reason": "مرخصی استحقاقی", "days": random.randint(1, 5)},
                "completed_nodes": ["node_trigger"],
                "created_at": start_date.isoformat(),
                "updated_at": (start_date + timedelta(hours=1)).isoformat()
            }
            
            if status_choice in ["completed", "rejected"]:
                p_doc["completed_nodes"].append("node_approval")
                p_doc["completed_nodes"].append("node_end")
                if status_choice == "completed":
                    p_doc["context"]["status"] = "approved"
                else:
                    p_doc["context"]["status"] = "rejected"
            else:
                p_doc["current_node_id"] = "node_approval"

            await db.process_instances.insert_one(p_doc)
            
            # Create the corresponding task in Postgres
            task_status = "pending"
            if status_choice == "completed":
                task_status = "approved"
            elif status_choice == "rejected":
                task_status = "rejected"
                
            task = await Task.objects.acreate(
                org=org,
                workflow=wf,
                process_instance_id=process_id,
                node_id="node_approval",
                assigned_to=hr_manager,
                status=task_status
            )
            # Update task created_at
            await Task.objects.filter(id=task.id).aupdate(created_at=start_date, updated_at=(start_date + timedelta(hours=1)))
            
            # Activity Log
            await db.activity_logs.insert_one({
                "id": str(uuid.uuid4()),
                "org_id": str(org.id),
                "actor_name": emp1.full_name,
                "action": "process.started",
                "target_type": "process",
                "target_id": process_id,
                "summary": "درخواست مرخصی ثبت شد",
                "created_at": start_date.isoformat(),
            })

            if status_choice != "in_progress":
                await db.activity_logs.insert_one({
                    "id": str(uuid.uuid4()),
                    "org_id": str(org.id),
                    "actor_name": hr_manager.full_name,
                    "action": f"task.{task_status}",
                    "target_type": "task",
                    "target_id": str(task.id),
                    "summary": f"تایید مدیر: {task_status}",
                    "created_at": (start_date + timedelta(hours=1)).isoformat(),
                })
