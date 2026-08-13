from django.contrib import admin
from unfold.admin import ModelAdmin
from django.contrib.auth.models import Group
from .models import Organization, User, Department, Workflow, Task, AIProviderConfig

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


@admin.register(AIProviderConfig)
class AIProviderConfigAdmin(ModelAdmin):
    list_display = ("name", "model", "base_url", "is_active", "updated_at")
    list_filter = ("is_active",)
    search_fields = ("name", "model", "base_url")
    readonly_fields = ("created_at", "updated_at")
    actions = ("make_active",)

    fieldsets = (
        (None, {"fields": ("name", "is_active")}),
        ("Endpoint", {"fields": ("base_url", "model", "api_key")}),
        ("Timestamps", {"fields": ("created_at", "updated_at")}),
    )

    @admin.action(description="Switch the project to the selected config")
    def make_active(self, request, queryset):
        if queryset.count() != 1:
            self.message_user(
                request, "Select exactly one config to activate.", level="error"
            )
            return
        config = queryset.first()
        config.activate()
        self.message_user(request, f"AI provider switched to {config.name} ({config.model}).")

    def save_model(self, request, obj, form, change):
        """Route the is_active checkbox through activate().

        Saving is_active=True directly would trip the partial unique constraint
        as a 500 whenever another config was already active, so the deactivate
        step has to happen in the same transaction.
        """
        if obj.is_active:
            obj.is_active = False
            super().save_model(request, obj, form, change)
            obj.activate()
        else:
            super().save_model(request, obj, form, change)
