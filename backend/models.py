"""Pydantic models for Jaryan workflow platform."""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, EmailStr, Field, model_validator

from db import BaseDocument, new_id, now_iso

# ---------- Users & Org ----------

RoleFa = Literal[
    "ادمین سازمان",
    "طراح فرایند",
    "مدیر تیم",
    "کارمند",
]


class Organization(BaseDocument):
    name: str
    slug: str


class User(BaseDocument):
    org_id: str
    email: EmailStr
    full_name: str
    role: RoleFa
    password_hash: str
    avatar_color: str = "#737373"
    department_id: Optional[str] = None
    manager_id: Optional[str] = None


class Department(BaseDocument):
    org_id: str
    name: str
    parent_id: Optional[str] = None
    manager_id: Optional[str] = None


class DepartmentCreate(BaseModel):
    name: str
    parent_id: Optional[str] = None
    manager_id: Optional[str] = None


class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[str] = None
    manager_id: Optional[str] = None


class UserPublic(BaseModel):
    id: str
    org_id: str
    email: EmailStr
    full_name: str
    role: RoleFa
    avatar_color: str
    department_id: Optional[str] = None
    manager_id: Optional[str] = None


class LoginPayload(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    token: str
    user: UserPublic


class UserCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    role: RoleFa
    password: str = Field(min_length=6, max_length=128)
    department_id: Optional[str] = None
    manager_id: Optional[str] = None


class UserRoleUpdate(BaseModel):
    role: Optional[RoleFa] = None
    department_id: Optional[str] = None
    manager_id: Optional[str] = None


# ---------- Workflow ----------


class VisibilityRule(BaseModel):
    """Reusable structured rule used by edges (workflow conditions)
    and form fields (conditional visibility).

    Supports either a single clause OR an AND/OR group:
      - single: {field_id, op, value}
      - group:  {combinator: "and"|"or", conditions: [VisibilityRule, ...]}
    Both shapes coexist; old single-clause docs remain valid.
    """

    # single-clause fields
    field_id: Optional[str] = None
    op: Optional[
        Literal["=", "!=", ">", "<", ">=", "<=", "contains", "empty", "not_empty"]
    ] = None
    value: Optional[str] = ""
    # group fields
    combinator: Optional[Literal["and", "or"]] = None
    conditions: Optional[list["VisibilityRule"]] = None


class WorkflowNode(BaseModel):
    id: str
    type: Literal[
        "trigger", "task", "approval", "condition", "form", "end", "ai_task", "ocr_task"
    ]
    label: str
    position: dict  # {x, y}
    data: dict = Field(default_factory=dict)  # assignee_role, form_id, condition, etc
    dependencies: list[str] = Field(default_factory=list)
    timeout_seconds: Optional[int] = None
    timeout_action: Optional[Literal["escalate_to_manager", "auto_reject", "none"]] = (
        "none"
    )
    retry_count: Optional[int] = None
    retry_delay: Optional[int] = None


class WorkflowEdge(BaseModel):
    id: str
    source: str
    target: str
    label: Optional[str] = None
    # Structured rule: evaluated against process context to decide branch.
    # If null, edge is taken unconditionally (default branch).
    condition: Optional["VisibilityRule"] = None


class Workflow(BaseDocument):
    org_id: str
    name: str
    description: str = ""
    status: Literal["draft", "published", "archived"] = "draft"
    trigger_type: Literal["manual", "cron"] = "manual"
    cron_expression: Optional[str] = None
    last_triggered_at: Optional[str] = None
    nodes: list[WorkflowNode] = Field(default_factory=list)
    edges: list[WorkflowEdge] = Field(default_factory=list)
    created_by: str  # user id

    @model_validator(mode="after")
    def validate_dag_integrity(self):
        if self.status != "published":
            return self

        adj = {node.id: [] for node in self.nodes}
        for edge in self.edges:
            if edge.source in adj:
                adj[edge.source].append(edge.target)

        visited = set()
        rec_stack = set()

        def is_cyclic(node_id):
            visited.add(node_id)
            rec_stack.add(node_id)

            for neighbor in adj.get(node_id, []):
                if neighbor not in visited:
                    if is_cyclic(neighbor):
                        return True
                elif neighbor in rec_stack:
                    return True

            rec_stack.remove(node_id)
            return False

        for node in self.nodes:
            if node.id not in visited:
                if is_cyclic(node.id):
                    raise ValueError(
                        "Cycle detected: Workflows must be Directed Acyclic Graphs (DAGs)."
                    )

        return self


class WorkflowCreate(BaseModel):
    name: str
    description: str = ""
    trigger_type: Literal["manual", "cron"] = "manual"
    cron_expression: Optional[str] = None
    nodes: list[WorkflowNode] = Field(default_factory=list)
    edges: list[WorkflowEdge] = Field(default_factory=list)


class WorkflowUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[Literal["draft", "published", "archived"]] = None
    trigger_type: Optional[Literal["manual", "cron"]] = None
    cron_expression: Optional[str] = None
    nodes: Optional[list[WorkflowNode]] = None
    edges: Optional[list[WorkflowEdge]] = None


# ---------- Forms ----------


class TabOption(BaseModel):
    id: str
    label: str


class FormField(BaseModel):
    id: str
    type: Literal[
        "text",
        "textarea",
        "number",
        "date",
        "select",
        "checkbox",
        "user",
        "file",
        "heading",
        "divider",
        "tabs",
    ]
    label: str
    placeholder: str = ""
    required: bool = False
    options: list[str] = Field(default_factory=list)
    # For "tabs" type: list of tab definitions
    tab_options: list[TabOption] = Field(default_factory=list)
    # If this field belongs inside a "tabs" parent, identify it:
    parent_tab_field_id: Optional[str] = None
    parent_tab_id: Optional[str] = None
    # Structured visibility rule; null means always visible
    visible_if: Optional[VisibilityRule] = None

    # Validation Rules
    min_length: Optional[int] = None
    max_length: Optional[int] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    pattern: Optional[str] = None
    error_message: Optional[str] = None


class Form(BaseDocument):
    org_id: str
    name: str
    description: str = ""
    fields: list[FormField] = Field(default_factory=list)
    created_by: str


class FormCreate(BaseModel):
    name: str
    description: str = ""
    fields: list[FormField] = Field(default_factory=list)


class FormUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    fields: Optional[list[FormField]] = None


# ---------- Process Instances & Tasks ----------


class ProcessInstance(BaseDocument):
    org_id: str
    workflow_id: str
    workflow_name: str
    started_by: Optional[str] = None
    current_node_id: Optional[str] = None
    status: Literal["running", "completed", "rejected", "stuck"] = "running"
    completed_nodes: list[str] = Field(default_factory=list)
    context: dict = Field(default_factory=dict)  # form submissions etc.
    workflow_snapshot: Optional[dict] = None  # frozen {nodes, edges} at start time


class Task(BaseDocument):
    org_id: str
    process_id: str
    workflow_id: str
    workflow_name: str
    node_id: str
    title: str
    assignee_id: Optional[str] = None
    assignee_role: Optional[RoleFa] = None
    type: Literal["task", "approval", "form"] = "task"
    status: Literal[
        "waiting", "pending", "in_progress", "approved", "rejected", "done"
    ] = "pending"
    wait_conditions: list[str] = Field(default_factory=list)
    priority: Literal["low", "medium", "high", "urgent"] = "medium"
    deadline: Optional[str] = None  # iso
    seen_time: Optional[str] = None  # iso — set when status → in_progress
    done_time: Optional[str] = None  # iso — set when status → done/approved/rejected
    form_id: Optional[str] = None
    form_data: dict = Field(default_factory=dict)
    draft_data: dict = Field(default_factory=dict)
    description: str = ""
    field_permissions: dict = Field(
        default_factory=dict
    )  # {field_id: "editable"|"readonly"|"hidden"}
    escalated: bool = False
    attempt_number: int = 1


class TaskUpdate(BaseModel):
    status: Optional[
        Literal["waiting", "pending", "in_progress", "approved", "rejected", "done"]
    ] = None
    wait_conditions: Optional[list[str]] = None
    form_data: Optional[dict] = None
    note: Optional[str] = None


class TaskDraftUpdate(BaseModel):
    draft_data: dict


# ---------- Comments & Activity ----------


class Comment(BaseDocument):
    org_id: str
    target_type: Literal["node", "task", "process"]
    target_id: str
    author_id: str
    author_name: str
    body: str
    mentions: list[str] = Field(default_factory=list)


class CommentCreate(BaseModel):
    target_type: Literal["node", "task", "process"]
    target_id: str
    body: str
    mentions: Optional[list[str]] = None


class ActivityLog(BaseDocument):
    org_id: str
    actor_id: Optional[str] = None
    actor_name: str = ""
    action: str  # e.g. "task.approved"
    target_type: str
    target_id: str
    summary: str = ""


# ---------- AI Chat ----------


class ChatMessage(BaseDocument):
    org_id: str
    session_id: str
    user_id: str
    role: Literal["user", "assistant"]
    content: str
    generated_workflow: Optional[dict] = None  # parsed workflow JSON


class ChatGenerateRequest(BaseModel):
    session_id: str = Field(default_factory=new_id)
    message: str
