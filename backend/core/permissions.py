"""Role-based permissions for the Jaryan API.

Before this module existed every viewset in core/views.py was a bare
``IsAuthenticated``, which meant any authenticated employee could create or
delete users and departments. The FastAPI stack this project was ported from
guarded those endpoints with an inline ``if user.role != "مدیر": 403`` — that
guard was lost in the port and is restored here.

Roles live in one place so that phase 3 of plan/00-refactor-plan.md (the
expansion from two roles to four) only has to touch this file: add the new
role constants and put them in the right frozenset below.
"""

from rest_framework.permissions import BasePermission, SAFE_METHODS

# ── Role constants ──────────────────────────────────────────────────────────
# These must match core.models.User.ROLE_CHOICES.
ROLE_ADMIN = "مدیر"
ROLE_EMPLOYEE = "کارمند"

# Executive and director-general tiers. These sign off on budget, contracts and
# large purchases in the four روش اجرایی processes, so they get administrative
# access to the organisation.
ROLE_CENTER_HEAD = "رئیس مرکز"
ROLE_DEPUTY = "معاون برنامه‌ریزی و توسعه مدیریت"
ROLE_DG_SUPPORT = "مدیرکل پشتیبانی و تدارکات"
ROLE_DG_FINANCE = "مدیرکل مالی و سرمایه انسانی"
ROLE_DG_IT = "مدیرکل فناوری اطلاعات"
ROLE_DG_SECURITY = "مدیرکل حراست"
ROLE_DG_TRANSFORMATION = "مدیرکل تحول اداری"

# Department heads: they route and approve inside their own area but do not
# administer users.
ROLE_HEAD_PROCUREMENT = "رئیس اداره تدارکات"
ROLE_HEAD_SUPPORT = "رئیس اداره پشتیبانی"
ROLE_HEAD_IT = "رئیس اداره فناوری اطلاعات"
ROLE_HEAD_IT_PROTECTION = "رئیس اداره حفاظت فناوری اطلاعات"

# Roles allowed to administer the organisation: create/edit/delete users and
# departments. Kept deliberately narrow — an approval authority is not the same
# thing as user administration.
ORG_ADMIN_ROLES = frozenset(
    {
        ROLE_ADMIN,
        ROLE_CENTER_HEAD,
        ROLE_DEPUTY,
        ROLE_DG_SUPPORT,
        ROLE_DG_FINANCE,
        ROLE_DG_IT,
        ROLE_DG_SECURITY,
        ROLE_DG_TRANSFORMATION,
    }
)

# Roles allowed to author workflows and forms. Process design belongs to the
# transformation office plus anyone with organisation-wide administrative
# rights; 'کارشناس فرآیندها' is the working-level process author named in the
# تأمین کالا document.
DESIGNER_ROLES = frozenset(ORG_ADMIN_ROLES | {"کارشناس فرآیندها"})

# Department heads: not org admins, but they do approve and route work. Exposed
# so views and the engine can reason about approval authority without
# hardcoding strings.
DEPARTMENT_HEAD_ROLES = frozenset(
    {
        ROLE_HEAD_PROCUREMENT,
        ROLE_HEAD_SUPPORT,
        ROLE_HEAD_IT,
        ROLE_HEAD_IT_PROTECTION,
    }
)

# Every role that can be the approver on an approval node.
APPROVER_ROLES = frozenset(ORG_ADMIN_ROLES | DEPARTMENT_HEAD_ROLES)



def _role_of(user):
    return getattr(user, "role", None)


class IsOrgAdmin(BasePermission):
    """Only organisation administrators, for every method including reads."""

    message = "insufficient_permissions"

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and _role_of(user) in ORG_ADMIN_ROLES
        )


class IsOrgAdminOrReadOnly(BasePermission):
    """Any authenticated user may read; only administrators may write.

    Used for users and departments: the whole app reads /users/ to populate
    assignee pickers, so reads must stay open to every authenticated member of
    the organisation. The tenant manager already scopes those reads to the
    caller's own organisation.
    """

    message = "insufficient_permissions"

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return _role_of(user) in ORG_ADMIN_ROLES


class IsDesignerOrReadOnly(BasePermission):
    """Any authenticated user may read; only designers may write.

    Used for workflows and forms. Note that starting a workflow is not an
    authoring action — an ordinary employee filing a leave request must be able
    to do it — so WorkflowViewSet exempts its ``start`` action from this check.
    """

    message = "insufficient_permissions"

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return _role_of(user) in DESIGNER_ROLES


class IsDesigner(BasePermission):
    """Only designers, for every method including reads.

    Unlike IsDesignerOrReadOnly there is no read exemption, because the thing
    being protected is not a stored object but the act of calling the LLM:
    a GET that returns a chat transcript still exposes generated content, and
    an unmetered generation endpoint open to every employee is a cost and
    abuse problem.
    """

    message = "insufficient_permissions"

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and _role_of(user) in DESIGNER_ROLES
        )
