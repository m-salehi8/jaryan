"""Iteration-3 tests: publish-guard on start, AND/OR group rules, nested groups, round-trip."""
import pytest

from conftest import BASE_URL, auth_headers
from engine import evaluate_rule


# ---------- Publish guard on POST /api/workflows/{id}/start ----------
class TestPublishGuard:
    def test_start_on_draft_returns_400(self, session, designer_token):
        payload = {
            "name": "TEST_iter3_draft_guard",
            "description": "",
            "nodes": [
                {"id": "n1", "type": "trigger", "label": "شروع", "position": {"x": 0, "y": 0}, "data": {}},
                {"id": "n2", "type": "end", "label": "پایان", "position": {"x": 200, "y": 0}, "data": {}},
            ],
            "edges": [{"id": "e1", "source": "n1", "target": "n2"}],
        }
        r = session.post(f"{BASE_URL}/api/workflows", json=payload, headers=auth_headers(designer_token))
        assert r.status_code == 200, r.text
        wf_id = r.json()["id"]
        assert r.json()["status"] == "draft"
        # Try to start while draft
        r2 = session.post(f"{BASE_URL}/api/workflows/{wf_id}/start", headers=auth_headers(designer_token))
        assert r2.status_code == 400, f"expected 400, got {r2.status_code}: {r2.text}"
        body = r2.json()
        # FastAPI returns {"detail": "..."}
        detail = body.get("detail") or body.get("message") or ""
        assert "workflow_not_published" in str(detail), f"unexpected detail: {body}"
        # Cleanup
        session.delete(f"{BASE_URL}/api/workflows/{wf_id}", headers=auth_headers(designer_token))

    def test_start_after_publish_returns_200(self, session, designer_token):
        payload = {
            "name": "TEST_iter3_publish_ok",
            "description": "",
            "nodes": [
                {"id": "n1", "type": "trigger", "label": "شروع", "position": {"x": 0, "y": 0}, "data": {}},
                {"id": "n2", "type": "task", "label": "کار", "position": {"x": 200, "y": 0},
                 "data": {"assignee_role": "کارمند"}},
                {"id": "n3", "type": "end", "label": "پایان", "position": {"x": 400, "y": 0}, "data": {}},
            ],
            "edges": [
                {"id": "e1", "source": "n1", "target": "n2"},
                {"id": "e2", "source": "n2", "target": "n3"},
            ],
        }
        r = session.post(f"{BASE_URL}/api/workflows", json=payload, headers=auth_headers(designer_token))
        assert r.status_code == 200, r.text
        wf_id = r.json()["id"]
        # Publish
        r2 = session.patch(f"{BASE_URL}/api/workflows/{wf_id}", json={"status": "published"},
                           headers=auth_headers(designer_token))
        assert r2.status_code == 200
        assert r2.json()["status"] == "published"
        # Start should now succeed and return {process, advanced}
        r3 = session.post(f"{BASE_URL}/api/workflows/{wf_id}/start", headers=auth_headers(designer_token))
        assert r3.status_code == 200, r3.text
        body = r3.json()
        assert "process" in body and "advanced" in body, f"missing wrapper keys: {body}"
        assert body["process"]["workflow_id"] == wf_id
        assert body["process"]["status"] == "running"
        # Cleanup
        session.delete(f"{BASE_URL}/api/workflows/{wf_id}", headers=auth_headers(designer_token))


# ---------- Engine: group AND/OR rule evaluation ----------
class TestEvaluateGroupRule:
    def test_and_group_all_match(self):
        rule = {
            "combinator": "and",
            "conditions": [
                {"field_id": "_task_status", "op": "=", "value": "approved"},
                {"field_id": "amount", "op": ">", "value": "5000000"},
            ],
        }
        assert evaluate_rule(rule, {"_task_status": "approved", "amount": "8000000"}) is True

    def test_and_group_one_fails(self):
        rule = {
            "combinator": "and",
            "conditions": [
                {"field_id": "_task_status", "op": "=", "value": "approved"},
                {"field_id": "amount", "op": ">", "value": "5000000"},
            ],
        }
        assert evaluate_rule(rule, {"_task_status": "approved", "amount": "1000000"}) is False

    def test_or_group_one_match(self):
        rule = {
            "combinator": "or",
            "conditions": [
                {"field_id": "_task_status", "op": "=", "value": "approved"},
                {"field_id": "amount", "op": ">", "value": "5000000"},
            ],
        }
        # only second matches
        assert evaluate_rule(rule, {"_task_status": "rejected", "amount": "8000000"}) is True
        # neither matches
        assert evaluate_rule(rule, {"_task_status": "rejected", "amount": "1000000"}) is False

    def test_nested_group(self):
        # (A AND B) OR C
        rule = {
            "combinator": "or",
            "conditions": [
                {"combinator": "and", "conditions": [
                    {"field_id": "a", "op": "=", "value": "1"},
                    {"field_id": "b", "op": "=", "value": "2"},
                ]},
                {"field_id": "c", "op": "=", "value": "3"},
            ],
        }
        assert evaluate_rule(rule, {"a": "1", "b": "2", "c": "0"}) is True   # inner AND matches
        assert evaluate_rule(rule, {"a": "1", "b": "9", "c": "3"}) is True   # outer C matches
        assert evaluate_rule(rule, {"a": "1", "b": "9", "c": "0"}) is False  # neither matches

    def test_empty_conditions_list_defaults_true(self):
        # Per engine logic, empty conditions in a group -> True
        assert evaluate_rule({"combinator": "and", "conditions": []}, {}) is True

    def test_single_clause_backwards_compat(self):
        # Old shape still works
        assert evaluate_rule({"field_id": "x", "op": "=", "value": "5"}, {"x": "5"}) is True
        assert evaluate_rule({"field_id": "x", "op": ">", "value": "10"}, {"x": "5"}) is False


# ---------- API round-trip: group rules on edges and visible_if ----------
class TestGroupRuleRoundTrip:
    def test_edge_group_rule_persists_through_patch(self, session, designer_token):
        group_rule = {
            "combinator": "and",
            "conditions": [
                {"field_id": "_task_status", "op": "=", "value": "approved"},
                {"field_id": "amount", "op": ">", "value": "5000000"},
            ],
        }
        payload = {
            "name": "TEST_iter3_group_edge",
            "description": "",
            "nodes": [
                {"id": "n1", "type": "trigger", "label": "شروع", "position": {"x": 0, "y": 0}, "data": {}},
                {"id": "n2", "type": "approval", "label": "تایید", "position": {"x": 200, "y": 0},
                 "data": {"assignee_role": "مدیر تیم"}},
                {"id": "n3", "type": "task", "label": "مالی", "position": {"x": 400, "y": 0},
                 "data": {"assignee_role": "ادمین سازمان"}},
                {"id": "n4", "type": "end", "label": "پایان", "position": {"x": 600, "y": 0}, "data": {}},
            ],
            "edges": [
                {"id": "e1", "source": "n1", "target": "n2"},
                {"id": "e2", "source": "n2", "target": "n3", "condition": group_rule},
                {"id": "e3", "source": "n3", "target": "n4"},
            ],
        }
        r = session.post(f"{BASE_URL}/api/workflows", json=payload, headers=auth_headers(designer_token))
        assert r.status_code == 200, r.text
        wf_id = r.json()["id"]

        # GET and verify the group rule is preserved
        full = session.get(f"{BASE_URL}/api/workflows/{wf_id}", headers=auth_headers(designer_token)).json()
        e2 = next(e for e in full["edges"] if e["id"] == "e2")
        assert e2["condition"]["combinator"] == "and"
        assert len(e2["condition"]["conditions"]) == 2
        c0 = e2["condition"]["conditions"][0]
        assert c0["field_id"] == "_task_status" and c0["op"] == "=" and c0["value"] == "approved"

        # PATCH the workflow (rename) and confirm group rule still intact
        r2 = session.patch(f"{BASE_URL}/api/workflows/{wf_id}",
                           json={"name": "TEST_iter3_group_edge_v2", "edges": full["edges"]},
                           headers=auth_headers(designer_token))
        assert r2.status_code == 200, r2.text
        full2 = session.get(f"{BASE_URL}/api/workflows/{wf_id}", headers=auth_headers(designer_token)).json()
        e2b = next(e for e in full2["edges"] if e["id"] == "e2")
        assert e2b["condition"]["combinator"] == "and"
        assert len(e2b["condition"]["conditions"]) == 2

        # Now flip to OR and re-PATCH
        new_edges = full2["edges"]
        for e in new_edges:
            if e["id"] == "e2":
                e["condition"]["combinator"] = "or"
        r3 = session.patch(f"{BASE_URL}/api/workflows/{wf_id}", json={"edges": new_edges},
                           headers=auth_headers(designer_token))
        assert r3.status_code == 200, r3.text
        full3 = session.get(f"{BASE_URL}/api/workflows/{wf_id}", headers=auth_headers(designer_token)).json()
        e2c = next(e for e in full3["edges"] if e["id"] == "e2")
        assert e2c["condition"]["combinator"] == "or"

        # Cleanup
        session.delete(f"{BASE_URL}/api/workflows/{wf_id}", headers=auth_headers(designer_token))


# ---------- E2E: AND group on edge takes/skips correctly ----------
def _build_petty_with_group(combinator: str):
    """Build a small petty-like workflow with a group condition edge."""
    return {
        "name": f"TEST_iter3_group_e2e_{combinator}",
        "description": "",
        "nodes": [
            {"id": "n1", "type": "trigger", "label": "شروع", "position": {"x": 0, "y": 0}, "data": {}},
            {"id": "n2", "type": "form", "label": "فرم", "position": {"x": 200, "y": 0},
             "data": {"assignee_role": "کارمند"}},
            {"id": "n3", "type": "approval", "label": "تایید مدیر", "position": {"x": 400, "y": 0},
             "data": {"assignee_role": "مدیر تیم"}},
            # Branch A: conditional (group). If taken -> admin task
            {"id": "n4", "type": "approval", "label": "تایید ادمین", "position": {"x": 600, "y": 100},
             "data": {"assignee_role": "ادمین سازمان"}},
            # Branch B: default fallthrough -> payment then end
            {"id": "n5", "type": "task", "label": "پرداخت", "position": {"x": 600, "y": -100},
             "data": {"assignee_role": "ادمین سازمان"}},
            {"id": "n6", "type": "end", "label": "پایان", "position": {"x": 800, "y": 0}, "data": {}},
        ],
        "edges": [
            {"id": "e1", "source": "n1", "target": "n2"},
            {"id": "e2", "source": "n2", "target": "n3"},
            {"id": "e3", "source": "n3", "target": "n4", "condition": {
                "combinator": combinator,
                "conditions": [
                    {"field_id": "_task_status", "op": "=", "value": "approved"},
                    {"field_id": "amount", "op": ">", "value": "5000000"},
                ],
            }},
            {"id": "e4", "source": "n3", "target": "n5"},  # default
            {"id": "e5", "source": "n4", "target": "n5"},
            {"id": "e6", "source": "n5", "target": "n6"},
        ],
    }


def _publish_and_start(session, designer_token, payload):
    r = session.post(f"{BASE_URL}/api/workflows", json=payload, headers=auth_headers(designer_token))
    assert r.status_code == 200, r.text
    wf_id = r.json()["id"]
    r2 = session.patch(f"{BASE_URL}/api/workflows/{wf_id}", json={"status": "published"},
                       headers=auth_headers(designer_token))
    assert r2.status_code == 200
    r3 = session.post(f"{BASE_URL}/api/workflows/{wf_id}/start", headers=auth_headers(designer_token))
    assert r3.status_code == 200, r3.text
    return wf_id, r3.json()["process"]


def _find_pending(session, token, pid, node_id=None):
    rows = session.get(f"{BASE_URL}/api/tasks?assigned_to_me=true&status=pending",
                       headers=auth_headers(token)).json()
    rows = [t for t in rows if t["process_id"] == pid]
    if node_id:
        rows = [t for t in rows if t["node_id"] == node_id]
    return rows[0] if rows else None


class TestE2EGroupEdges:
    def test_and_group_taken_when_both_match(self, session, designer_token, employee_token, manager_token):
        wf_id, proc = _publish_and_start(session, designer_token, _build_petty_with_group("and"))
        pid = proc["id"]
        # Employee submits form with amount=8M
        emp = _find_pending(session, employee_token, pid)
        assert emp, "employee task missing after start"
        session.patch(f"{BASE_URL}/api/tasks/{emp['id']}",
                      json={"status": "done", "form_data": {"amount": "8000000"}},
                      headers=auth_headers(employee_token))
        # Manager approves -> AND group should be satisfied (status=approved AND amount>5M)
        mgr = _find_pending(session, manager_token, pid)
        assert mgr, "manager task missing"
        r = session.patch(f"{BASE_URL}/api/tasks/{mgr['id']}",
                          json={"status": "approved"}, headers=auth_headers(manager_token))
        assert r.status_code == 200, r.text
        next_ids = [t["node_id"] for t in r.json()["advanced"].get("next_tasks", [])]
        assert "n4" in next_ids, f"expected n4 (admin) in next_tasks (AND matched), got: {next_ids}"
        session.delete(f"{BASE_URL}/api/workflows/{wf_id}", headers=auth_headers(designer_token))

    def test_and_group_skipped_when_one_fails(self, session, designer_token, employee_token, manager_token):
        wf_id, proc = _publish_and_start(session, designer_token, _build_petty_with_group("and"))
        pid = proc["id"]
        emp = _find_pending(session, employee_token, pid)
        assert emp
        session.patch(f"{BASE_URL}/api/tasks/{emp['id']}",
                      json={"status": "done", "form_data": {"amount": "1000000"}},
                      headers=auth_headers(employee_token))
        mgr = _find_pending(session, manager_token, pid)
        assert mgr
        r = session.patch(f"{BASE_URL}/api/tasks/{mgr['id']}",
                          json={"status": "approved"}, headers=auth_headers(manager_token))
        assert r.status_code == 200, r.text
        next_ids = [t["node_id"] for t in r.json()["advanced"].get("next_tasks", [])]
        # AND fails (amount=1M); engine should fallthrough to default edge -> n5 (payment)
        assert "n4" not in next_ids, f"n4 should be skipped (AND group failed): {next_ids}"
        assert "n5" in next_ids, f"expected default n5 (payment), got: {next_ids}"
        session.delete(f"{BASE_URL}/api/workflows/{wf_id}", headers=auth_headers(designer_token))

    def test_or_group_taken_when_one_matches(self, session, designer_token, employee_token, manager_token):
        wf_id, proc = _publish_and_start(session, designer_token, _build_petty_with_group("or"))
        pid = proc["id"]
        emp = _find_pending(session, employee_token, pid)
        assert emp
        # amount below threshold, but manager will approve -> OR satisfied via _task_status
        session.patch(f"{BASE_URL}/api/tasks/{emp['id']}",
                      json={"status": "done", "form_data": {"amount": "1000000"}},
                      headers=auth_headers(employee_token))
        mgr = _find_pending(session, manager_token, pid)
        assert mgr
        r = session.patch(f"{BASE_URL}/api/tasks/{mgr['id']}",
                          json={"status": "approved"}, headers=auth_headers(manager_token))
        assert r.status_code == 200, r.text
        next_ids = [t["node_id"] for t in r.json()["advanced"].get("next_tasks", [])]
        assert "n4" in next_ids, f"expected n4 in next_tasks (OR matched via _task_status), got: {next_ids}"
        session.delete(f"{BASE_URL}/api/workflows/{wf_id}", headers=auth_headers(designer_token))
