import asyncio
import json
from datetime import datetime
from pathlib import Path

from django.core.management.base import BaseCommand

from core.models import Organization, Department, User, Workflow, Task, current_org_id
from core.mongo import get_db


# Dataset directory: /dataset/ (mounted or copied at container build)
DATASET_DIR = Path("/dataset")


def _load_json(name: str) -> list[dict]:
    path = DATASET_DIR / f"{name}.json"
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f)


class Command(BaseCommand):
    help = "Seeds the hybrid DB from static JSON files in dataset/"

    def handle(self, *args, **kwargs):
        self.stdout.write("🌱 Seeding hybrid DB from dataset/ JSON files...")

        # ── Load JSON data ──
        orgs_data = _load_json("organizations")
        depts_data = _load_json("departments")
        users_data = _load_json("users")
        workflows_data = _load_json("workflows")
        procs_data = _load_json("process_instances")
        tasks_data = _load_json("tasks")
        activities_data = _load_json("activities")
        comments_data = _load_json("comments")
        chat_sessions_data = _load_json("chat_sessions")
        chat_messages_data = _load_json("chat_messages")
        system_events_data = _load_json("system_events")
        metrics_data = _load_json("metrics_hourly")

        self.stdout.write(f"  ✓ Loaded {len(orgs_data)} orgs, {len(depts_data)} depts, "
                          f"{len(users_data)} users, {len(workflows_data)} workflows")
        self.stdout.write(f"    {len(procs_data)} process instances, {len(tasks_data)} tasks")
        self.stdout.write(f"    {len(activities_data)} activities, {len(comments_data)} comments")
        self.stdout.write(f"    {len(chat_sessions_data)} chat sessions, {len(chat_messages_data)} messages")
        self.stdout.write(f"    {len(system_events_data)} events, {len(metrics_data)} metric points")

        # ── Flush PostgreSQL ──
        self.stdout.write("\n  🧹 Flushing PostgreSQL data...")
        Task.objects.all().delete()
        Workflow.objects.all().delete()
        User.objects.all().delete()
        Department.objects.all().delete()
        Organization.objects.all().delete()

        # ── Seed PostgreSQL (sync ORM) ──
        self.stdout.write("  📦 Seeding Organizations...")
        id_to_org = {}
        for o in orgs_data:
            org = Organization.objects.create(
                id=o["id"],
                name=o["name"],
                slug=o["slug"],
            )
            id_to_org[o["id"]] = org
        org = id_to_org.get("org_fanaavaran", list(id_to_org.values())[0])
        current_org_id.set(str(org.id))

        self.stdout.write("  📦 Seeding Departments...")
        id_to_dept = {}
        for d in depts_data:
            dept = Department.objects.create(
                id=d["id"],
                org=org,
                name=d["name"],
            )
            id_to_dept[d["id"]] = dept

        self.stdout.write("  📦 Seeding Users...")
        id_to_user = {}
        for u in users_data:
            dept = id_to_dept.get(u.get("dept", ""))
            user = User.objects.create(
                id=u["id"],
                org=org,
                email=u["email"],
                full_name=u["name"],
                role=u["role"],
                avatar_color=u.get("color", "#737373"),
                department=dept,
            )
            pw = "admin123" if u["id"] == "u_admin" else "pass123"
            user.set_password(pw)
            user.save()
            id_to_user[u["id"]] = user

        # Link department managers
        for u_data in users_data:
            if u_data["role"] == "مدیر":
                user = id_to_user.get(u_data["id"])
                dept = id_to_dept.get(u_data.get("dept", ""))
                if dept and user:
                    dept.manager = user
                    dept.save()

        # Link employee managers
        dept_managers = {}
        for d in Department.objects.filter(org=org):
            if d.manager_id:
                dept_managers[d.id] = d.manager_id

        for u_data in users_data:
            if u_data["role"] == "کارمند":
                user = id_to_user.get(u_data["id"])
                dept_id = u_data.get("dept", "")
                mgr_id = dept_managers.get(dept_id)
                if mgr_id and user:
                    user.manager_id = mgr_id
                    user.save()

        self.stdout.write("  📦 Seeding Workflows...")
        id_to_workflow = {}
        admin = id_to_user.get("u_admin", list(id_to_user.values())[0])
        for w in workflows_data:
            wf = Workflow.objects.create(
                id=w["id"],
                org=org,
                name=w["name"],
                description=w.get("description", ""),
                status="published",
                created_by=admin,
                nodes=w.get("nodes", []),
                edges=w.get("edges", []),
            )
            id_to_workflow[w["id"]] = wf

        self.stdout.write("  📦 Seeding Tasks...")
        for t in tasks_data:
            wf = id_to_workflow.get(t.get("workflow_id"))
            assignee = id_to_user.get(t.get("assignee_id"))
            if not wf or not assignee:
                continue
            created = self._parse_dt(t.get("created_at"))
            updated = self._parse_dt(t.get("updated_at"))

            task = Task.objects.create(
                id=t["id"],
                org=org,
                workflow=wf,
                process_instance_id=t.get("process_id", ""),
                node_id=t.get("node_id", ""),
                assigned_to=assignee,
                status=t.get("status", "pending"),
                form_data=t.get("form_data", {}),
                draft_data=t.get("draft_data", {}),
            )
            if created:
                Task.objects.filter(id=task.id).update(created_at=created)
            if updated:
                Task.objects.filter(id=task.id).update(updated_at=updated)

        self.stdout.write(f"    ✅ {len(tasks_data)} tasks created")

        # ── Seed MongoDB (async motor) ──
        async def seed_mongo():
            db = get_db()
            for coll in [
                "process_instances", "activity_logs", "chat_messages",
                "chat_sessions", "comments", "system_events", "metrics_hourly",
            ]:
                try:
                    await db[coll].drop()
                except Exception:
                    pass  # may not exist

            self.stdout.write("\n  🍃 Seeding MongoDB — process_instances...")
            if procs_data:
                for p in procs_data:
                    if "id" in p:
                        p["_id"] = p.pop("id")
                await db.process_instances.insert_many(procs_data)
            self.stdout.write(f"    ✅ {len(procs_data)} process instances")

            for coll, name, data in [
                ("activity_logs", "activities", activities_data),
                ("comments", "comments", comments_data),
                ("chat_sessions", "chat sessions", chat_sessions_data),
                ("chat_messages", "chat messages", chat_messages_data),
                ("system_events", "system events", system_events_data),
                ("metrics_hourly", "metrics", metrics_data),
            ]:
                self.stdout.write(f"  🍃 Seeding MongoDB — {name}...")
                if data:
                    for doc in data:
                        if "id" in doc and "_id" not in doc:
                            doc["_id"] = doc.pop("id")
                    await db[coll].insert_many(data)
                self.stdout.write(f"    ✅ {len(data)} {name}")

        asyncio.run(seed_mongo())

        self.stdout.write(self.style.SUCCESS("\n✅ Hybrid DB seed complete!"))

    @staticmethod
    def _parse_dt(value):
        if not value:
            return None
        try:
            return datetime.fromisoformat(value)
        except (ValueError, TypeError):
            return None