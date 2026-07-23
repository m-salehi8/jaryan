from core.models import Organization, User, Workflow, Task

def dashboard_callback(request, context):
    """
    Callback to inject dashboard data into the Unfold admin index template.
    """
    # Fetch overall counts bypassing the tenant manager
    org_count = Organization.objects.count()
    user_count = User.objects.get_all_tenants().count()
    
    # Workflow stats
    workflows = Workflow.objects.get_all_tenants()
    total_workflows = workflows.count()
    draft_workflows = workflows.filter(status='draft').count()
    published_workflows = workflows.filter(status='published').count()
    archived_workflows = workflows.filter(status='archived').count()

    # Task stats
    total_tasks = Task.objects.get_all_tenants().count()

    context.update({
        "stats": [
            {"title": "سازمان‌ها", "value": org_count, "icon": "business"},
            {"title": "کاربران", "value": user_count, "icon": "group"},
            {"title": "فرآیندها", "value": total_workflows, "icon": "account_tree"},
            {"title": "وظایف", "value": total_tasks, "icon": "task"},
        ],
        "workflow_chart": {
            "labels": ["پیش‌نویس", "منتشر شده", "آرشیو"],
            "data": [draft_workflows, published_workflows, archived_workflows],
        }
    })
    return context
