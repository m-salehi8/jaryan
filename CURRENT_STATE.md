# Jaryan (formerly Raahkar) - Current State Document

This document captures the exact current state of the Jaryan project. It serves as a baseline before adding any new features.

## 1. System Architecture & Tech Stack

**Backend:**
- **Framework:** FastAPI with Uvicorn.
- **Database:** MongoDB, accessed via Motor (async).
- **Validation:** Pydantic (v2) for models and schemas.
- **Authentication:** JWT tokens (`pyjwt`), password hashing via `bcrypt` / `passlib`.
- **Other Key Libraries:** `croniter` (for cron jobs), `boto3` (AWS S3/storage integration).

**Frontend:**
- **Framework:** React 19 (via CRA/Craco) and React Router DOM v7.
- **Styling:** TailwindCSS (v3.4.17) with Radix UI components for accessibility.
- **Form Handling:** `react-hook-form` with `zod` for validation.
- **Workflow Visualization:** `reactflow` (v11) and `dagre` for auto-layout.
- **Date Handling:** `jalali-date-picker` / `moment-jalaali` for Persian dates.

## 2. Current Database Schemas

The database leverages MongoDB collections wrapped by Pydantic models (found in `models.py`):

- **Workflows (`Workflow`, `WorkflowNode`, `WorkflowEdge`)**
  - **Nodes** support types: `trigger`, `task`, `approval`, `condition`, `form`, `end`. They store `position`, `dependencies`, and `data` (which includes `assignee_role` and `form_id`).
  - **Edges** support branching via a structured `condition` (`VisibilityRule`).
  
- **Forms (`Form`, `FormField`)**
  - Fields support types like `text`, `number`, `select`, `date`, `user`, and structural types like `heading`, `divider`, and `tabs`.
  - Conditional visibility is governed by `visible_if` (using the same `VisibilityRule` schema).

- **Execution (`ProcessInstance`, `Task`)**
  - **`ProcessInstance`**: Tracks the overall process state (`running`, `completed`, `rejected`, `stuck`), a list of `completed_nodes`, the `current_node_id`, and a unified `context` dictionary containing all submitted form data.
  - **`Task`**: Represents work generated for a node. Tracks `status` (`pending`, `waiting`, `in_progress`, etc.), `wait_conditions` (dependencies), and `assignee_role`.

## 3. Engine Logic

The core execution logic resides in `backend/engine.py` (`advance_process`):
1. **Rule Evaluation:** Transitions are determined by `evaluate_rule`, which checks edge conditions against the single, global `process.context` dict.
2. **Traversal:** The engine performs a BFS traversal from the completed node, evaluating outgoing edges. If a `condition` node is hit, it passes through.
3. **Task Generation:** For actionable target nodes (e.g., `form`, `approval`, `task`), a new `Task` document is created.
4. **Dependencies:** If a node requires multiple incoming edges (`dependencies`), the task is created in a `"waiting"` state. Its `wait_conditions` list is progressively cleared as incoming paths complete. Once empty, it becomes `"pending"`.
5. **Updates:** The `ProcessInstance` is updated with the new `current_node_id`, modified `context`, and process `status`.

## 4. Recently Added Features (Analysis)

A detailed review of the codebase regarding requested specific features reveals their actual implementation status:

- **Snapshot-based execution**
  - **Current State:** *Not Implemented*. 
  - **Details:** The engine currently fetches the live workflow document (`await db.workflows.find_one({"id": process["workflow_id"]})`) in `engine.py` line 124. The `ProcessInstance` only stores the `workflow_id` and `workflow_name`. It does not persist a template snapshot. Thus, modifying a published workflow currently affects active running instances.

- **Dynamic Hierarchical Assignment**
  - **Current State:** *Role-Based Pooling (Not Hierarchical)*.
  - **Details:** Assignments are currently resolved strictly via static roles. A node specifies an `assignee_role` (e.g., `"مدیر تیم"`). In `server.py`, the GET `/api/tasks` endpoint fetches tasks using a simple `$or` query: `[{"assignee_id": user.id}, {"assignee_role": user.role, "assignee_id": None}]`. There is no logic traversing an organizational chart or dynamically resolving "the submitter's manager".

- **Node-Specific Field Permissions**
  - **Current State:** *Global Form Level Only*.
  - **Details:** The `FormRenderer.js` component accepts a single `readOnly` boolean prop that disables all inputs. Form fields themselves have a `visible_if` property for conditional rendering based on context. However, there is no node-specific configuration that marks a specific field as "editable" on Node A but "read-only" on Node B. The `Task` schema only points to a `form_id` without any permission overrides.

## 5. Frontend State

- **Workflow Builder (`WorkflowBuilder.js`):** A full-featured React Flow canvas. It allows dragging and dropping nodes, configuring edge conditions, and assigning roles (`assignee_role`) or forms (`form_id`) via a side-panel. 
- **Form Renderer (`FormRenderer.js`):** A dynamic component capable of rendering schemas live. It successfully handles nested tabs (`childrenOfTab`), evaluates `visible_if` logic locally (`evaluateRule`), and uses Radix UI and Jalali Date Pickers. 
- **Task Management:** The UI lists tasks and approvals, rendering the associated `FormRenderer` either in an interactive state or read-only based on the task's status.
