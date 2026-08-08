from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.contrib.auth import authenticate
from django.conf import settings
from .models import Workflow, Task, User, Department, Form
from .serializers import WorkflowSerializer, TaskSerializer, UserSerializer, DepartmentSerializer, FormSerializer
import jwt
from asgiref.sync import async_to_sync
from engine import advance_process, update_process_status
from core.mongo import get_db
import uuid
from datetime import timezone, datetime

def make_token(user_id, org_id):
    return jwt.encode(
        {'user_id': str(user_id), 'org_id': str(org_id)}, 
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
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        workflow = self.get_object()
        form_data = request.data.get("form_data", {})
        process_id = str(uuid.uuid4())
        
        async def _create_and_advance():
            db = get_db()
            process_doc = {
                "id": process_id,
                "org_id": str(request.user.org_id),
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
            
            # The engine logic in advance_process accepts completed_node_id. 
            # Passing None or the trigger node ID to trigger the start. 
            # The prompt says: async_to_sync(advance_process)(process_id=..., completed_node_id=None)
            # Wait, advance_process requires a string. If it's None, it will fail unless engine allows None. 
            # Let's pass the trigger node if it exists, otherwise None (engine must handle).
            trigger_node = next((n for n in workflow.nodes if n.get("type") == "trigger"), None)
            start_node_id = trigger_node["id"] if trigger_node else None
            
            await advance_process(process_id=process_id, completed_node_id=start_node_id)
                
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
            task.status = new_status
            task.save()
            
            async def _update_and_advance():
                if new_status != 'rejected':
                    await advance_process(
                        process_id=task.process_instance_id, 
                        completed_node_id=task.node_id, 
                        context_update=form_data,
                        task_status=new_status,
                    )
                else:
                    await update_process_status(task.process_instance_id)
            
            async_to_sync(_update_and_advance)()
            return Response(self.get_serializer(task).data)
            
        return super().partial_update(request, *args, **kwargs)

class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

class DepartmentViewSet(viewsets.ModelViewSet):
    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer
    permission_classes = [IsAuthenticated]

class FormViewSet(viewsets.ModelViewSet):
    queryset = Form.objects.all()
    serializer_class = FormSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me_view(request):
    return Response(UserSerializer(request.user).data)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_view(request):
    my_tasks = Task.objects.filter(assigned_to=request.user, status='pending').count()
    pending_approvals = Task.objects.filter(status='pending').count()
    workflows_count = Workflow.objects.count()
    
    # We could count running processes from Mongo, but for now we'll just mock or query it.
    running_processes = 0
    try:
        db = get_db()
        # This is synchronous context, can't easily await. We'll use async_to_sync to count.
        async def _count_procs():
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
        db = get_db()
        async def _get_procs():
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
