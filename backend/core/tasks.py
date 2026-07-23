from celery import shared_task
from asgiref.sync import async_to_sync
from engine import check_timeouts

@shared_task
def check_timeouts_task():
    """
    Periodically checks for tasks that have missed their deadlines
    and executes timeout actions (like auto_reject).
    """
    async_to_sync(check_timeouts)()

@shared_task
def advance_process_task(org_id, process_id, workflow_id, node_id=None):
    """
    Background execution of advance_process if needed to avoid blocking
    the HTTP request thread.
    """
    from engine import advance_process
    async_to_sync(advance_process)(org_id, process_id, workflow_id, node_id)
