from django.contrib import admin
from unfold.admin import ModelAdmin
from django.contrib.auth.models import Group
from .models import Organization, User, Department, Workflow, Task

# We unregister the default Group model to keep the admin panel clean
admin.site.unregister(Group)

@admin.register(Organization)
class OrganizationAdmin(ModelAdmin):
    list_display = ("name", "slug")
    search_fields = ("name", "slug")

@admin.register(User)
class UserAdmin(ModelAdmin):
    list_display = ("email", "full_name", "role", "org", "department")
    search_fields = ("email", "full_name")
    list_filter = ("role", "org")
    
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Personal info", {"fields": ("full_name", "avatar_color")}),
        ("Organization & Role", {"fields": ("org", "department", "role", "manager")}),
        ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser")}),
    )

@admin.register(Department)
class DepartmentAdmin(ModelAdmin):
    list_display = ("name", "org", "parent", "manager")
    list_filter = ("org",)
    search_fields = ("name",)

@admin.register(Workflow)
class WorkflowAdmin(ModelAdmin):
    list_display = ("name", "org", "status", "trigger_type", "created_by")
    list_filter = ("status", "trigger_type", "org")
    search_fields = ("name",)

@admin.register(Task)
class TaskAdmin(ModelAdmin):
    list_display = ("id", "workflow", "assigned_to", "status", "created_at")
    list_filter = ("status", "workflow__org")
    search_fields = ("process_instance_id", "assigned_to__email")
    readonly_fields = ("created_at", "updated_at")
