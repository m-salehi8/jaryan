"""Seed a sample Iran-localised organisation with users, departments, forms and a workflow.

Usage:
    python manage.py seed          # idempotent — skips if the org already exists
    python manage.py seed --reset  # wipe the sample org first, then recreate
"""

import uuid

from django.core.management.base import BaseCommand
from django.db import transaction

from core.models import Organization, Department, User, Workflow, Form, current_org_id

ORG_SLUG = "jaryan"
ORG_NAME = "سازمان نمونه جریان"

USERS = [
    # email, full_name, password, role, avatar_color
    ("admin@jaryan.ir", "مدیر سیستم", "admin1234", "مدیر", "#0F172A"),
    ("designer@jaryan.ir", "طراح فرایند", "1234", "کارمند", "#7C3AED"),
    ("manager@jaryan.ir", "مدیر تیم", "1234", "مدیر", "#0EA5E9"),
    ("employee@jaryan.ir", "کارمند نمونه", "1234", "کارمند", "#16A34A"),
]

LEAVE_FORM_FIELDS = [
    {"id": "start_date", "label": "تاریخ شروع", "type": "date", "required": True},
    {"id": "end_date", "label": "تاریخ پایان", "type": "date", "required": True},
    {"id": "days", "label": "تعداد روز", "type": "number", "required": True},
    {"id": "reason", "label": "دلیل مرخصی", "type": "textarea", "required": False},
]


class Command(BaseCommand):
    help = "Seed the sample organisation, users, departments, forms and workflow."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Delete the existing sample organisation before seeding.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        # The tenant manager filters every query by current_org_id. Seeding runs
        # outside any request, so make sure no stale tenant filter is applied.
        current_org_id.set(None)

        existing = Organization.objects.filter(slug=ORG_SLUG).first()
        if existing and options["reset"]:
            self.stdout.write("Removing existing sample organisation…")
            existing.delete()
            existing = None
        elif existing:
            self.stdout.write(
                self.style.WARNING(
                    f"Organisation '{ORG_SLUG}' already exists (id={existing.id}). "
                    "Use --reset to recreate it."
                )
            )
            return

        org = Organization.objects.create(id=str(uuid.uuid4()), name=ORG_NAME, slug=ORG_SLUG)
        self.stdout.write(f"Created organisation {org.name}")

        it_dept = Department.objects.create(id=str(uuid.uuid4()), org=org, name="فناوری اطلاعات")
        hr_dept = Department.objects.create(id=str(uuid.uuid4()), org=org, name="منابع انسانی")

        created_users = {}
        for email, full_name, password, role, color in USERS:
            user = User(
                id=str(uuid.uuid4()),
                org=org,
                email=email,
                full_name=full_name,
                role=role,
                avatar_color=color,
                department=it_dept if email != "manager@jaryan.ir" else hr_dept,
            )
            user.set_password(password)
            if email == "admin@jaryan.ir":
                user.is_staff = True
                user.is_superuser = True
            user.save()
            created_users[email] = user
            self.stdout.write(f"  user {email} / {password}")

        # Reporting line: everyone reports to the team manager.
        manager = created_users["manager@jaryan.ir"]
        for email in ("designer@jaryan.ir", "employee@jaryan.ir"):
            created_users[email].manager = manager
            created_users[email].save(update_fields=["manager"])

        hr_dept.manager = manager
        hr_dept.save(update_fields=["manager"])
        it_dept.manager = created_users["admin@jaryan.ir"]
        it_dept.save(update_fields=["manager"])

        leave_form = Form.objects.create(
            id=str(uuid.uuid4()),
            org=org,
            name="فرم درخواست مرخصی",
            description="ثبت درخواست مرخصی روزانه",
            fields=LEAVE_FORM_FIELDS,
            created_by=created_users["designer@jaryan.ir"],
        )

        # A minimal but complete graph: trigger → form → approval → end.
        trigger_id, form_id, approval_id, end_id = (
            "node_trigger",
            "node_form",
            "node_approval",
            "node_end",
        )
        Workflow.objects.create(
            id=str(uuid.uuid4()),
            org=org,
            name="درخواست مرخصی",
            description="فرایند نمونه: ثبت درخواست مرخصی و تأیید مدیر",
            status="published",
            trigger_type="manual",
            created_by=created_users["designer@jaryan.ir"],
            nodes=[
                {"id": trigger_id, "type": "trigger", "label": "شروع", "data": {}},
                {
                    "id": form_id,
                    "type": "form",
                    "label": "تکمیل فرم مرخصی",
                    "data": {
                        "assignee_type": "specific_user",
                        "assignee_id": str(created_users["employee@jaryan.ir"].id),
                        "form_id": str(leave_form.id),
                    },
                },
                {
                    "id": approval_id,
                    "type": "approval",
                    "label": "تأیید مدیر",
                    "data": {"assignee_type": "manager"},
                },
                {"id": end_id, "type": "end", "label": "پایان", "data": {}},
            ],
            edges=[
                {"id": "e1", "source": trigger_id, "target": form_id},
                {"id": "e2", "source": form_id, "target": approval_id},
                {"id": "e3", "source": approval_id, "target": end_id},
            ],
        )

        self.stdout.write(self.style.SUCCESS("Seed complete."))
        self.stdout.write("Login with admin@jaryan.ir / admin1234")
