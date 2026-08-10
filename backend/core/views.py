from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.contrib.auth import authenticate
from django.conf import settings
from django.db import IntegrityError
from django.http import StreamingHttpResponse
from .models import Workflow, Task, User, Department, Form, AIProviderConfig
from .permissions import (
    IsOrgAdminOrReadOnly,
    IsDesignerOrReadOnly,
    IsOrgAdmin,
    IsDesigner,
)
from .serializers import (
    WorkflowSerializer,
    TaskSerializer,
    UserSerializer,
    DepartmentSerializer,
    FormSerializer,
    AIProviderConfigSerializer,
)
from services.ai_service import ai_service, resolve_provider
from services.workflow_validation import normalize_workflow
import httpx
import json
import jwt
import logging
import threading
from queue import Queue
from asgiref.sync import async_to_sync
from engine import advance_process, update_process_status
from core.mongo import get_db
import uuid
from datetime import timezone, datetime, timedelta

logger = logging.getLogger(__name__)

# How long an issued access token stays valid.
JWT_TTL = timedelta(days=14)


def make_token(user_id, org_id):
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            'user_id': str(user_id),
            'org_id': str(org_id),
            # Without an exp claim tokens never expire, which made the
            # ExpiredSignatureError branch in core/auth.py unreachable.
            'iat': now,
            'exp': now + JWT_TTL,
        },
        settings.SECRET_KEY,
        algorithm='HS256'
    )

@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    email = request.data.get('email')
    password = request.data.get('password')
    user = authenticate(email=email, password=password)
    if user:
        token = make_token(user.id, user.org_id)
        return Response({
            'token': token,
            'user': UserSerializer(user).data
        })
    return Response({'error': 'Invalid credentials'}, status=status.HTTP_401_UNAUTHORIZED)

class WorkflowViewSet(viewsets.ModelViewSet):
    queryset = Workflow.objects.all()
    serializer_class = WorkflowSerializer
    permission_classes = [IsDesignerOrReadOnly]

    def get_permissions(self):
        # Starting a workflow is not an authoring action — an ordinary employee
        # filing a leave request must be able to do it.
        if self.action == 'start':
            return [IsAuthenticated()]
        return super().get_permissions()

    def perform_create(self, serializer):
        serializer.save(
            id=str(uuid.uuid4()),
            org=self.request.user.org,
            created_by=self.request.user,
        )

    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        workflow = self.get_object()

        # An unpublished workflow is still being edited; running it would create
        # tasks from a half-finished graph.
        if workflow.status != 'published':
            return Response(
                {"detail": "workflow_not_published"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        form_data = request.data.get("form_data", {})
        process_id = str(uuid.uuid4())
        org_id = str(request.user.org_id)

        async def _create_and_advance():
            db = get_db()
            process_doc = {
                "id": process_id,
                "org_id": org_id,
                "workflow_id": str(workflow.id),
                "workflow_name": workflow.name,
                "started_by": str(request.user.id),
                "status": "in_progress",
                "context": form_data,
                "completed_nodes": [],
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.process_instances.insert_one(process_doc)

            # Advance from the trigger node. A workflow without a trigger node has
            # no defined entry point, so there is nothing to advance from.
            trigger_node = next((n for n in workflow.nodes if n.get("type") == "trigger"), None)
            if trigger_node is None:
                return
            await advance_process(
                process_id=process_id,
                org_id=org_id,
                completed_node_id=trigger_node["id"],
            )

        async_to_sync(_create_and_advance)()
        return Response({"process_id": process_id}, status=status.HTTP_201_CREATED)

class TaskViewSet(viewsets.ModelViewSet):
    queryset = Task.objects.all()
    serializer_class = TaskSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        
        assigned_to_me = self.request.query_params.get('assigned_to_me')
        if assigned_to_me and assigned_to_me.lower() == 'true':
            qs = qs.filter(assigned_to=self.request.user)
            
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
            
        return qs

    def partial_update(self, request, *args, **kwargs):
        task = self.get_object()
        new_status = request.data.get('status')
        form_data = request.data.get('form_data', {})

        if new_status in ['approved', 'done', 'rejected']:
            # Only the assignee may act on a task. Without this check any
            # authenticated user could approve or reject any task by id.
            if task.assigned_to_id != request.user.id:
                return Response(
                    {"detail": "not_task_assignee"},
                    status=status.HTTP_403_FORBIDDEN,
                )

            previous_status = task.status

            # Idempotency guard: a double submit (or a retried request) must not
            # advance the process twice. Only a task still open can be
            # transitioned, and the transition is a single conditional UPDATE so
            # two concurrent requests cannot both win. 'waiting' is excluded
            # deliberately: a parallel-join task is not yet actionable.
            # .update() bypasses auto_now, so updated_at is set explicitly.
            updated = Task.objects.filter(
                pk=task.pk, status='pending'
            ).update(status=new_status, updated_at=datetime.now(timezone.utc))
            if not updated:
                return Response(
                    {"ok": False, "reason": "already_processed"},
                    status=status.HTTP_409_CONFLICT,
                )

            task.refresh_from_db()
            if form_data:
                task.form_data = {**(task.form_data or {}), **form_data}
                task.save(update_fields=['form_data', 'updated_at'])

            org_id = str(task.org_id)

            async def _update_and_advance():
                if new_status != 'rejected':
                    await advance_process(
                        process_id=task.process_instance_id,
                        org_id=org_id,
                        completed_node_id=task.node_id,
                        context_update=form_data,
                        task_status=new_status,
                    )
                else:
                    await update_process_status(task.process_instance_id, org_id)

            try:
                async_to_sync(_update_and_advance)()
            except Exception:
                # The status was committed before the engine ran, so a failure
                # here would leave the task closed while the process never
                # moved — and the idempotency guard above would then reject
                # every retry. Roll the task back so the action can be redone.
                Task.objects.filter(pk=task.pk).update(
                    status=previous_status,
                    updated_at=datetime.now(timezone.utc),
                )
                logger.exception(
                    "advance_process failed for task %s; rolled status back to %s",
                    task.pk, previous_status,
                )
                return Response(
                    {"detail": "process_advance_failed"},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )

            return Response(self.get_serializer(task).data)

        return super().partial_update(request, *args, **kwargs)

class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    # Reads stay open: the app fetches /users/ to populate assignee pickers.
    # Writes are administrators only.
    permission_classes = [IsOrgAdminOrReadOnly]

    def perform_create(self, serializer):
        # org comes from the caller's token, never the request body, so a user
        # cannot be planted in another organisation.
        serializer.save(id=str(uuid.uuid4()), org=self.request.user.org)

    def create(self, request, *args, **kwargs):
        try:
            return super().create(request, *args, **kwargs)
        except IntegrityError:
            return Response(
                {"detail": "email_already_exists"},
                status=status.HTTP_409_CONFLICT,
            )

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        new_role = request.data.get('role')
        if (
            new_role
            and str(instance.id) == str(request.user.id)
            and new_role != instance.role
        ):
            return Response(
                {"detail": "cannot_change_own_role"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if str(instance.id) == str(request.user.id):
            return Response(
                {"detail": "cannot_delete_self"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


class DepartmentViewSet(viewsets.ModelViewSet):
    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer
    permission_classes = [IsOrgAdminOrReadOnly]

    def perform_create(self, serializer):
        serializer.save(id=str(uuid.uuid4()), org=self.request.user.org)


class FormViewSet(viewsets.ModelViewSet):
    queryset = Form.objects.all()
    serializer_class = FormSerializer
    permission_classes = [IsDesignerOrReadOnly]

    def perform_create(self, serializer):
        serializer.save(
            id=str(uuid.uuid4()),
            org=self.request.user.org,
            created_by=self.request.user,
        )

class AIProviderConfigViewSet(viewsets.ModelViewSet):
    """Manage and switch the LLM endpoint the AI features use.

    Administrators only for every method including reads, because even the
    masked representation exposes the endpoints this deployment talks to.

    This is deployment-wide configuration rather than tenant data, so unlike
    the other viewsets it neither filters by nor assigns an organisation.
    """

    queryset = AIProviderConfig.objects.all()
    serializer_class = AIProviderConfigSerializer
    permission_classes = [IsOrgAdmin]

    def perform_create(self, serializer):
        config = serializer.save(id=str(uuid.uuid4()))
        # First config ever created becomes the active one; otherwise creating
        # a config is inert until it is explicitly activated.
        if not AIProviderConfig.objects.filter(is_active=True).exists():
            config.activate()

    def create(self, request, *args, **kwargs):
        try:
            return super().create(request, *args, **kwargs)
        except ValidationError as exc:
            # The serializer's unique check on `name` normally fires first; the
            # IntegrityError below is the race-condition backstop. Both mean the
            # same thing to a caller, so report them the same way.
            if self._is_duplicate_name(exc):
                return Response(
                    {"detail": "config_name_already_exists"},
                    status=status.HTTP_409_CONFLICT,
                )
            raise
        except IntegrityError:
            return Response(
                {"detail": "config_name_already_exists"},
                status=status.HTTP_409_CONFLICT,
            )

    @staticmethod
    def _is_duplicate_name(exc):
        detail = exc.detail
        if not isinstance(detail, dict):
            return False
        return any(
            getattr(error, "code", None) == "unique"
            for error in detail.get("name", [])
        )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.is_active:
            # Deleting the active config would silently fall the whole AI layer
            # back to the environment variables. Make it an explicit two-step.
            return Response(
                {"detail": "cannot_delete_active_config"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=['get'])
    def active(self, request):
        """The config currently in force, or which env vars are standing in."""
        config = AIProviderConfig.get_active()
        if config is None:
            provider = resolve_provider()
            return Response({
                "source": "env",
                "base_url": provider.base_url,
                "model": provider.model,
                "api_key_preview": f"…{provider.api_key[-4:]}" if provider.api_key else "",
            })
        return Response({"source": "config", **self.get_serializer(config).data})

    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """Switch the whole deployment to this config. Effective immediately."""
        config = self.get_object()
        config.activate()
        logger.info(
            "AI provider switched to %r (%s) by %s",
            config.name, config.model, request.user.email,
        )
        return Response(self.get_serializer(config).data)

    @action(detail=False, methods=['post'])
    def test(self, request):
        """Prove the active config works by making a real 1-token call."""
        result = async_to_sync(ai_service.check_connection)()
        return Response(result, status=status.HTTP_200_OK if result["ok"] else status.HTTP_502_BAD_GATEWAY)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me_view(request):
    return Response(UserSerializer(request.user).data)


# ---------- AI chat-to-process ----------

def _sse_escape(text):
    """SSE frames are newline-delimited, so newlines inside data must be escaped.

    Chat.js reverses this with `.replace(/\\\\n/g, "\\n")` on each data line.
    """
    return text.replace("\r", "").replace("\n", "\\n")


def _sse_event(data, event=None):
    prefix = f"event: {event}\n" if event else ""
    return f"{prefix}data: {data}\n\n"


@api_view(['POST'])
@permission_classes([IsDesigner])
def ai_generate_workflow(request):
    """Stream a generated workflow to the chat page over SSE.

    Ported from the FastAPI implementation (server.py:1141), which died when
    the app moved to Django and left frontend/src/lib/api.js:64 calling a route
    that returned 404.

    Two things constrain the implementation. The wire format is fixed by the
    parser in Chat.js: bare `data:` frames are text deltas, `event: done`
    carries the workflow JSON, `event: error` carries a message. And the app is
    served by *synchronous* gunicorn workers (entrypoint.sh), so the async
    generator from the LLM client has to be driven from a sync generator here —
    it cannot be awaited by the WSGI layer.
    """
    message = (request.data.get("message") or "").strip()
    if not message:
        return Response({"detail": "message_required"}, status=status.HTTP_400_BAD_REQUEST)

    session_id = str(request.data.get("session_id") or uuid.uuid4())
    user = request.user
    org_id = str(user.org_id)
    user_id = str(user.id)

    def event_stream():
        full_text = ""
        try:
            # async_to_sync per chunk would spin up a fresh event loop each
            # time and lose the HTTP connection between chunks, so the whole
            # stream is consumed inside one loop and pumped out through a queue.
            for chunk in _iter_stream(session_id, message):
                full_text += chunk
                yield _sse_event(_sse_escape(chunk))
        except Exception as exc:
            logger.exception("AI stream failed")
            yield _sse_event(_sse_escape(_user_facing_error(exc)), event="error")
            return

        workflow, warnings = (None, [])
        try:
            workflow, warnings = normalize_workflow(ai_service.extract_json_block(full_text))
        except ValueError:
            # The model answered in prose without a JSON block. That is not an
            # error for the chat transcript — the text still streamed — so the
            # done event just carries no workflow and the save button stays
            # hidden (Chat.js checks wf.nodes && wf.edges).
            logger.info("AI response contained no usable workflow JSON")

        _persist_chat(org_id, session_id, user_id, message, full_text, workflow)

        payload = dict(workflow) if workflow else {}
        if workflow and warnings:
            payload["warnings"] = warnings
        yield _sse_event(json.dumps(payload, ensure_ascii=False).replace("\n", "\\n"), event="done")

    response = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
    response["Cache-Control"] = "no-cache"
    # Without this nginx buffers the whole response and the stream arrives as
    # one lump when it finishes, which defeats the point.
    response["X-Accel-Buffering"] = "no"
    return response


def _iter_stream(session_id, message):
    """Drain the async LLM stream into a sync generator, one event loop total."""
    queue = Queue()
    sentinel = object()

    async def pump():
        try:
            async for chunk in ai_service.stream_workflow_generation(session_id, message):
                queue.put(chunk)
        except Exception as exc:
            queue.put(exc)
        finally:
            queue.put(sentinel)

    thread = threading.Thread(target=lambda: async_to_sync(pump)(), daemon=True)
    thread.start()

    while True:
        item = queue.get()
        if item is sentinel:
            return
        if isinstance(item, Exception):
            raise item
        yield item


def _user_facing_error(exc):
    """Never leak the endpoint or key into the browser; they are admin-only."""
    if isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code in (401, 403):
        return "کلید API نامعتبر است یا دسترسی ندارد."
    if isinstance(exc, httpx.TimeoutException):
        return "پاسخ مدل بیش از حد طول کشید."
    if isinstance(exc, httpx.HTTPError):
        return "ارتباط با سرویس هوش مصنوعی برقرار نشد."
    return "خطا در تولید فرایند."


def _persist_chat(org_id, session_id, user_id, message, full_text, workflow):
    """Store the exchange in Mongo. Best-effort: losing history must not fail
    a request whose useful work (the stream) already reached the user."""
    try:
        now = datetime.now(timezone.utc).isoformat()

        async def _insert():
            db = get_db()
            await db.chat_messages.insert_many([
                {
                    "id": str(uuid.uuid4()), "org_id": org_id, "session_id": session_id,
                    "user_id": user_id, "role": "user", "content": message,
                    "generated_workflow": None, "created_at": now, "updated_at": now,
                },
                {
                    "id": str(uuid.uuid4()), "org_id": org_id, "session_id": session_id,
                    "user_id": user_id, "role": "assistant", "content": full_text,
                    "generated_workflow": workflow, "created_at": now, "updated_at": now,
                },
            ])

        async_to_sync(_insert)()
    except Exception:
        logger.warning("Could not persist chat history", exc_info=True)


@api_view(['GET'])
@permission_classes([IsDesigner])
def ai_session(request, session_id):
    """Chat transcript for one session, oldest first."""
    try:
        async def _fetch():
            db = get_db()
            cursor = db.chat_messages.find(
                {"session_id": session_id, "org_id": str(request.user.org_id)}, {"_id": 0}
            ).sort("created_at", 1)
            return await cursor.to_list(length=500)

        return Response(async_to_sync(_fetch)())
    except Exception:
        logger.exception("Could not load chat session")
        return Response({"detail": "history_unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_view(request):
    my_tasks = Task.objects.filter(assigned_to=request.user, status='pending').count()
    pending_approvals = Task.objects.filter(status='pending').count()
    workflows_count = Workflow.objects.count()
    
    # We could count running processes from Mongo, but for now we'll just mock or query it.
    running_processes = 0
    try:
        # get_db() must be called *inside* the coroutine: it binds the motor
        # client to the running event loop, and async_to_sync creates a fresh
        # loop per call. See core/mongo.py.
        async def _count_procs():
            db = get_db()
            return await db.process_instances.count_documents({"status": "in_progress", "org_id": str(request.user.org_id)})
        running_processes = async_to_sync(_count_procs)()
    except Exception as e:
        print("Mongo count error:", e)

    my_tasks_list = TaskSerializer(Task.objects.filter(assigned_to=request.user, status='pending')[:5], many=True).data
    pending_approvals_list = TaskSerializer(Task.objects.filter(status='pending')[:5], many=True).data

    return Response({
        "counters": {
            "my_tasks": my_tasks,
            "pending_approvals": pending_approvals,
            "running_processes": running_processes,
            "workflows": workflows_count
        },
        "my_tasks": my_tasks_list,
        "pending_approvals": pending_approvals_list,
        "running_processes": [],
        "recommendations": [
            {"id": 1, "title": "Create a Leave Request form", "reason": "Many users ask about leave requests", "icon": "sparkles"}
        ],
        "activities": [
            {"id": 1, "summary": "Workflow 'Leave Request' created", "actor_name": "System", "created_at": datetime.now(timezone.utc).isoformat()}
        ]
    })

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def process_list(request):
    try:
        async def _get_procs():
            # Bound inside the coroutine so the client matches the loop
            # async_to_sync just created. See core/mongo.py.
            db = get_db()
            cursor = db.process_instances.find({"org_id": str(request.user.org_id)})
            return await cursor.to_list(length=100)
        procs = async_to_sync(_get_procs)()
        # MongoDB _id is not JSON serializable usually, but we store 'id' string
        for p in procs:
            if '_id' in p:
                del p['_id']
        return Response(procs)
    except Exception as e:
        return Response({"error": str(e)}, status=500)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def analytics_users(request):
    return Response({"users_activity": []})

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def analytics_forms(request):
    return Response({"forms_usage": []})

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def comments_view(request):
    # Mocking comments for now
    if request.method == 'POST':
        return Response({"id": str(uuid.uuid4()), "content": request.data.get("content", ""), "created_at": datetime.now(timezone.utc).isoformat(), "author": UserSerializer(request.user).data})
    return Response([])
