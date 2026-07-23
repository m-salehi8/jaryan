"""Iteration-2 tests: conditional fields, tabs, process engine advancement, conditional edges."""

import time
import uuid

import pytest

from conftest import BASE_URL, auth_headers
from engine import evaluate_rule


# ---------- Seed checks: tabs form + conditional workflow ----------
class TestSeedIteration2:
    def test_forms_include_services_tabs_form(self, session, designer_token):
        r = session.get(f"{BASE_URL}/api/forms", headers=auth_headers(designer_token))
        assert r.status_code == 200
        forms = r.json()
        assert len(forms) >= 3, f"expected >=3 forms, got {len(forms)}"
        target = next((f for f in forms if "درخواست خدمات" in f["name"]), None)
        assert (
            target
        ), f"missing form 'فرم درخواست خدمات (پشتیبانی)'. Names: {[f['name'] for f in forms]}"
        full = session.get(
            f"{BASE_URL}/api/forms/{target['id']}", headers=auth_headers(designer_token)
        ).json()
        fields = full["fields"]
        assert len(fields) >= 10, f"expected >=10 fields, got {len(fields)}"
        # Has a tabs field
        tabs_field = next((f for f in fields if f.get("type") == "tabs"), None)
        assert tabs_field, "no tabs field present"
        assert (
            len(tabs_field.get("tab_options", [])) >= 5
        ), f"tab_options should have 5+, got {len(tabs_field.get('tab_options', []))}"
        for t in tabs_field["tab_options"]:
            assert "id" in t and "label" in t
        # Has children referencing parent_tab_field_id + parent_tab_id
        children = [
            f
            for f in fields
            if f.get("parent_tab_field_id") == tabs_field["id"]
            and f.get("parent_tab_id")
        ]
        assert (
            len(children) >= 2
        ), f"expected child fields under tabs, found {len(children)}"

    def test_petty_workflow_has_conditional_edge(self, session, admin_token):
        rows = session.get(
            f"{BASE_URL}/api/workflows", headers=auth_headers(admin_token)
        ).json()
        petty = next((w for w in rows if w["name"] == "فرایند درخواست تنخواه"), None)
        assert petty, "missing تنخواه workflow"
        full = session.get(
            f"{BASE_URL}/api/workflows/{petty['id']}", headers=auth_headers(admin_token)
        ).json()
        assert len(full["nodes"]) >= 6, f"expected >=6 nodes, got {len(full['nodes'])}"
        assert len(full["edges"]) >= 6, f"expected >=6 edges, got {len(full['edges'])}"
        cond_edges = [e for e in full["edges"] if e.get("condition")]
        assert cond_edges, "no conditional edges in تنخواه workflow"
        c = cond_edges[0]["condition"]
        assert "field_id" in c and "op" in c and "value" in c


# ---------- Form CRUD with tabs + visible_if ----------
class TestFormTabsAndVisibility:
    def test_create_form_with_tabs_and_visible_if_roundtrip(
        self, session, designer_token
    ):
        payload = {
            "name": "TEST_فرم تب‌دار",
            "description": "تست تب و شرط",
            "fields": [
                {
                    "id": "ftabs",
                    "type": "tabs",
                    "label": "نوع",
                    "tab_options": [
                        {"id": "t1", "label": "نوع ۱"},
                        {"id": "t2", "label": "نوع ۲"},
                    ],
                },
                {
                    "id": "fchild1",
                    "type": "text",
                    "label": "متن ۱",
                    "parent_tab_field_id": "ftabs",
                    "parent_tab_id": "t1",
                },
                {
                    "id": "fchild2",
                    "type": "text",
                    "label": "متن ۲",
                    "parent_tab_field_id": "ftabs",
                    "parent_tab_id": "t2",
                },
                {
                    "id": "fselect",
                    "type": "select",
                    "label": "نمایش؟",
                    "options": ["yes", "no"],
                },
                {
                    "id": "fcond",
                    "type": "text",
                    "label": "شرطی",
                    "visible_if": {"field_id": "fselect", "op": "=", "value": "yes"},
                },
            ],
        }
        r = session.post(
            f"{BASE_URL}/api/forms", json=payload, headers=auth_headers(designer_token)
        )
        assert r.status_code == 200, r.text
        fid = r.json()["id"]
        # PATCH: modify visible_if and verify persistence
        new_fields = payload["fields"]
        new_fields[-1]["visible_if"] = {
            "field_id": "fselect",
            "op": "!=",
            "value": "no",
        }
        r2 = session.patch(
            f"{BASE_URL}/api/forms/{fid}",
            json={"fields": new_fields},
            headers=auth_headers(designer_token),
        )
        assert r2.status_code == 200, r2.text
        # GET and verify all special fields preserved
        full = session.get(
            f"{BASE_URL}/api/forms/{fid}", headers=auth_headers(designer_token)
        ).json()
        ftabs = next(f for f in full["fields"] if f["id"] == "ftabs")
        assert ftabs["type"] == "tabs"
        assert len(ftabs["tab_options"]) == 2
        assert ftabs["tab_options"][0]["id"] == "t1"
        child1 = next(f for f in full["fields"] if f["id"] == "fchild1")
        assert child1["parent_tab_field_id"] == "ftabs"
        assert child1["parent_tab_id"] == "t1"
        fcond = next(f for f in full["fields"] if f["id"] == "fcond")
        assert fcond["visible_if"]["field_id"] == "fselect"
        assert fcond["visible_if"]["op"] == "!="
        assert fcond["visible_if"]["value"] == "no"
        # cleanup
        session.delete(
            f"{BASE_URL}/api/forms/{fid}", headers=auth_headers(designer_token)
        )


# ---------- Engine: evaluate_rule edge cases ----------
class TestEvaluateRule:
    def test_empty_rule_always_true(self):
        assert evaluate_rule(None, {}) is True
        assert evaluate_rule({}, {"x": 1}) is True

    def test_eq_numeric_coercion(self):
        assert (
            evaluate_rule({"field_id": "x", "op": "=", "value": "5"}, {"x": "5"})
            is True
        )
        assert (
            evaluate_rule({"field_id": "x", "op": "=", "value": "5"}, {"x": 5}) is True
        )
        assert (
            evaluate_rule({"field_id": "x", "op": "=", "value": "5"}, {"x": "6"})
            is False
        )

    def test_gt_lt_numeric(self):
        assert (
            evaluate_rule(
                {"field_id": "amt", "op": ">", "value": "5000000"}, {"amt": "8000000"}
            )
            is True
        )
        assert (
            evaluate_rule(
                {"field_id": "amt", "op": ">", "value": "5000000"}, {"amt": "1000000"}
            )
            is False
        )
        assert (
            evaluate_rule(
                {"field_id": "amt", "op": "<=", "value": "5000000"}, {"amt": "5000000"}
            )
            is True
        )

    def test_contains_string(self):
        assert (
            evaluate_rule(
                {"field_id": "s", "op": "contains", "value": "abc"}, {"s": "xxabcyy"}
            )
            is True
        )
        assert (
            evaluate_rule(
                {"field_id": "s", "op": "contains", "value": "zz"}, {"s": "xxabcyy"}
            )
            is False
        )

    def test_empty_not_empty(self):
        assert evaluate_rule({"field_id": "k", "op": "empty"}, {}) is True
        assert evaluate_rule({"field_id": "k", "op": "empty"}, {"k": ""}) is True
        assert evaluate_rule({"field_id": "k", "op": "not_empty"}, {"k": "v"}) is True
        assert evaluate_rule({"field_id": "k", "op": "not_empty"}, {"k": ""}) is False


# ---------- End-to-end process engine ----------
def _get_workflow(session, token, name):
    rows = session.get(f"{BASE_URL}/api/workflows", headers=auth_headers(token)).json()
    return next(w for w in rows if w["name"] == name)


def _get_tasks_for(session, token, process_id=None):
    rows = session.get(
        f"{BASE_URL}/api/tasks?assigned_to_me=true", headers=auth_headers(token)
    ).json()
    if process_id:
        rows = [t for t in rows if t["process_id"] == process_id]
    return rows


def _start_petty(session, designer_token):
    petty_summary = _get_workflow(session, designer_token, "فرایند درخواست تنخواه")
    petty = session.get(
        f"{BASE_URL}/api/workflows/{petty_summary['id']}",
        headers=auth_headers(designer_token),
    ).json()
    r = session.post(
        f"{BASE_URL}/api/workflows/{petty['id']}/start",
        headers=auth_headers(designer_token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    # Iteration-2 shape: {process, advanced}; fall back to flat for safety
    inst = body.get("process", body) if isinstance(body, dict) else body
    # Ensure first task got created by the engine
    advanced = body.get("advanced", {}) if isinstance(body, dict) else {}
    assert advanced.get(
        "next_tasks"
    ), f"start_workflow did not create first task: {body}"
    return petty, inst


def _find_pending_task_for(session, token, process_id, node_id=None):
    rows = session.get(
        f"{BASE_URL}/api/tasks?assigned_to_me=true&status=pending",
        headers=auth_headers(token),
    ).json()
    rows = [t for t in rows if t["process_id"] == process_id]
    if node_id:
        rows = [t for t in rows if t["node_id"] == node_id]
    return rows[0] if rows else None


def _amount_field_id(petty_workflow, session, designer_token):
    """Discover the amount field id from the form referenced by the first form-typed node."""
    form_node = next(
        (n for n in petty_workflow["nodes"] if n.get("type") == "form"), None
    )
    assert form_node, "no form node in petty workflow"
    form_id = form_node.get("data", {}).get("form_id")
    assert form_id, "form node missing form_id"
    form = session.get(
        f"{BASE_URL}/api/forms/{form_id}", headers=auth_headers(designer_token)
    ).json()
    # Find a numeric field whose id matches the conditional edge field_id
    return form, form_node


class TestEngineE2E:
    def test_above_threshold_traverses_finance_approval(
        self, session, designer_token, employee_token, manager_token, admin_token
    ):
        petty, inst = _start_petty(session, designer_token)
        pid = inst["id"]
        # Find conditional edge & its field_id
        cond_edge = next((e for e in petty["edges"] if e.get("condition")), None)
        assert cond_edge, "no conditional edge"
        amount_field_id = cond_edge["condition"]["field_id"]

        # Employee should now have a form task (node n2)
        emp_task = _find_pending_task_for(session, employee_token, pid)
        assert emp_task, "employee has no task after start"
        assert emp_task["type"] in ("form", "task")

        # Submit form with amount = 8,000,000 (above 5M threshold)
        r = session.patch(
            f"{BASE_URL}/api/tasks/{emp_task['id']}",
            json={"status": "done", "form_data": {amount_field_id: "8000000"}},
            headers=auth_headers(employee_token),
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "task" in body and "advanced" in body, f"missing wrapper: {body}"
        assert body["advanced"].get("ok") is True
        next_tasks = body["advanced"].get("next_tasks", [])
        assert len(next_tasks) >= 1, "no next_tasks created after employee submit"

        # Manager approves
        mgr_task = _find_pending_task_for(session, manager_token, pid)
        assert mgr_task, "manager has no approval after employee submit"
        r2 = session.patch(
            f"{BASE_URL}/api/tasks/{mgr_task['id']}",
            json={"status": "approved"},
            headers=auth_headers(manager_token),
        )
        assert r2.status_code == 200, r2.text
        b2 = r2.json()
        # Expect next_tasks to include n4 (admin) because amount > threshold
        next_ids = [t["node_id"] for t in b2["advanced"].get("next_tasks", [])]
        assert next_ids, f"no next tasks after manager approve: {b2}"

        # Admin approves
        admin_task = _find_pending_task_for(session, admin_token, pid)
        assert (
            admin_task
        ), f"admin has no task after manager approval (next ids were {next_ids})"
        r3 = session.patch(
            f"{BASE_URL}/api/tasks/{admin_task['id']}",
            json={"status": "approved"},
            headers=auth_headers(admin_token),
        )
        assert r3.status_code == 200, r3.text
        b3 = r3.json()
        # Should create payment task at n5
        pay_next = b3["advanced"].get("next_tasks", [])
        assert pay_next, f"no payment task after admin approval: {b3}"

        # Finance/payment task — assigned to whoever the node specifies; try all roles
        pay_task = None
        for tok in (admin_token, manager_token, employee_token):
            pay_task = _find_pending_task_for(session, tok, pid)
            if pay_task:
                pay_token = tok
                break
        assert pay_task, "no payment task pending after admin approval"
        r4 = session.patch(
            f"{BASE_URL}/api/tasks/{pay_task['id']}",
            json={"status": "done"},
            headers=auth_headers(pay_token),
        )
        assert r4.status_code == 200, r4.text
        b4 = r4.json()
        # Verify process completed
        proc = session.get(
            f"{BASE_URL}/api/processes/{pid}", headers=auth_headers(admin_token)
        ).json()
        assert (
            proc["process"]["status"] == "completed"
        ), f"process not completed: {proc['process']['status']}"

    def test_below_threshold_skips_finance(
        self, session, designer_token, employee_token, manager_token, admin_token
    ):
        petty, inst = _start_petty(session, designer_token)
        pid = inst["id"]
        cond_edge = next(e for e in petty["edges"] if e.get("condition"))
        amount_field_id = cond_edge["condition"]["field_id"]

        emp_task = _find_pending_task_for(session, employee_token, pid)
        assert emp_task
        session.patch(
            f"{BASE_URL}/api/tasks/{emp_task['id']}",
            json={"status": "done", "form_data": {amount_field_id: "1000000"}},
            headers=auth_headers(employee_token),
        )

        mgr_task = _find_pending_task_for(session, manager_token, pid)
        assert mgr_task
        r2 = session.patch(
            f"{BASE_URL}/api/tasks/{mgr_task['id']}",
            json={"status": "approved"},
            headers=auth_headers(manager_token),
        )
        b2 = r2.json()
        next_after_mgr = b2["advanced"].get("next_tasks", [])
        # admin should NOT receive a task; the next task should be the payment task (n5), not n4
        admin_task = _find_pending_task_for(session, admin_token, pid)
        # Admin may still be the ادمین (assignee for payment) — what matters is no n4 was created.
        # The conditional edge target (n4) should be skipped.
        n4_target = cond_edge["target"]
        bypass = all(t["node_id"] != n4_target for t in next_after_mgr)
        assert (
            bypass
        ), f"finance (n4={n4_target}) should be skipped, got: {next_after_mgr}"

    def test_rejection_stops_process(
        self, session, designer_token, employee_token, manager_token
    ):
        petty, inst = _start_petty(session, designer_token)
        pid = inst["id"]
        cond_edge = next(e for e in petty["edges"] if e.get("condition"))
        amount_field_id = cond_edge["condition"]["field_id"]

        emp_task = _find_pending_task_for(session, employee_token, pid)
        assert emp_task
        session.patch(
            f"{BASE_URL}/api/tasks/{emp_task['id']}",
            json={"status": "done", "form_data": {amount_field_id: "9000000"}},
            headers=auth_headers(employee_token),
        )
        mgr_task = _find_pending_task_for(session, manager_token, pid)
        assert mgr_task
        r = session.patch(
            f"{BASE_URL}/api/tasks/{mgr_task['id']}",
            json={"status": "rejected"},
            headers=auth_headers(manager_token),
        )
        assert r.status_code == 200, r.text
        proc = session.get(
            f"{BASE_URL}/api/processes/{pid}", headers=auth_headers(designer_token)
        ).json()
        assert (
            proc["process"]["status"] == "rejected"
        ), f"expected rejected, got {proc['process']['status']}"
        # No downstream tasks should have been created from rejection
        tasks = proc["tasks"]
        # admin approval node should NOT have a pending task
        # All tasks for this process should be from the upstream flow only
        statuses = [t["status"] for t in tasks]
        assert "pending" not in statuses or all(
            t["node_id"] in (emp_task["node_id"], mgr_task["node_id"])
            for t in tasks
            if t["status"] == "pending"
        ), f"rejection created downstream tasks: {tasks}"
