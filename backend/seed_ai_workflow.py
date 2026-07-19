import asyncio
from db import db
from models import Workflow, WorkflowNode, WorkflowEdge

async def seed_ai_workflow():
    # Fetch org
    org = await db.organizations.find_one({"slug": "raahkar"})
    if not org:
        print("Default organization 'raahkar' not found. Please run seed.py first.")
        return

    # Fetch designer user
    designer = await db.users.find_one({"email": "designer@raahkar.ir"})
    if not designer:
        print("Designer user not found.")
        return

    # Check if it already exists to avoid duplicates
    existing = await db.workflows.find_one({"name": "تنخواه هوشمند"})
    if existing:
        await db.workflows.delete_one({"name": "تنخواه هوشمند"})
        print("Removed existing 'تنخواه هوشمند' workflow.")

    wf = Workflow(
        org_id=org["id"],
        name="تنخواه هوشمند",
        description="فرایند هوشمند بررسی فاکتور خرید با استفاده از OCR و عامل هوش مصنوعی.",
        status="published",
        created_by=designer["id"],
        nodes=[
            WorkflowNode(
                id="n1", type="trigger", label="ثبت فاکتور",
                position={"x": 50, "y": 150}, data={}
            ),
            WorkflowNode(
                id="n2", type="ocr_task", label="استخراج دیتای فاکتور",
                position={"x": 250, "y": 150},
                data={
                    "source_file_variable": "{{receipt_image}}",
                    "extraction_prompt": "Extract the 'total_amount' as a number, and 'vendor_name' as a string from this receipt. Return ONLY valid JSON.",
                    "output_key": "ocr_result"
                }
            ),
            WorkflowNode(
                id="n3", type="ai_task", label="بررسی منطق خرید",
                position={"x": 480, "y": 150},
                data={
                    "system_prompt": "You are a finance assistant. Review the following OCR extraction data: {{ocr_result}}. Evaluate if the purchase is strictly related to 'office supplies'. Reply with JSON containing a boolean 'approved' and string 'reason'.",
                    "output_key": "ai_evaluation"
                }
            ),
            WorkflowNode(
                id="n4", type="condition", label="تصمیم‌گیری",
                position={"x": 720, "y": 150},
                data={
                    "expression": "ai_evaluation.approved == true"
                }
            ),
            WorkflowNode(
                id="n5", type="approval", label="تایید نهایی توسط انسان",
                position={"x": 950, "y": 50},
                data={
                    "assignee_role": "مدیر تیم"
                }
            ),
            WorkflowNode(
                id="n6", type="end", label="پایان (تایید)",
                position={"x": 1200, "y": 50}, data={}
            ),
            WorkflowNode(
                id="n7", type="end", label="پایان (ردود خودکار)",
                position={"x": 950, "y": 250}, data={}
            ),
        ],
        edges=[
            WorkflowEdge(id="e1", source="n1", target="n2"),
            WorkflowEdge(id="e2", source="n2", target="n3"),
            WorkflowEdge(id="e3", source="n3", target="n4"),
            WorkflowEdge(id="e4", source="n4", target="n5", label="تایید AI", 
                         condition={"field_id": "_ai_approved", "op": "=", "value": "dummy"}), # We will manually tweak the evaluator if needed, but in engine `evaluate_rule` needs valid rule or expression. Wait, the frontend builder uses rule objects. Let's use expression on the node itself. The condition node uses `expression` data to route to the first true edge, wait, `engine.py` evaluates the `condition` on the edge, not on the node! Let's check engine.py.
            WorkflowEdge(id="e5", source="n4", target="n7", label="رد AI"),
            WorkflowEdge(id="e6", source="n5", target="n6"),
        ],
    )

    # Let's fix the edge conditions for the 'condition' node routing.
    # In engine.py: chosen = [e for e in conditional if evaluate_rule(e.get("condition"), ctx)]
    # We will use our rule dict format for edge conditions. If engine doesn't support complex object traversal, 
    # we can use a simpler flat variable in mock_context for the rule matching if needed. 
    # But for simulation, any edge without a 'condition' is a default edge.
    
    wf.edges[3].condition = {"field_id": "ai_evaluation.approved", "op": "=", "value": "true"}
    
    await db.workflows.insert_one(wf.to_mongo())
    print("Successfully seeded 'تنخواه هوشمند' workflow.")

if __name__ == "__main__":
    asyncio.run(seed_ai_workflow())
