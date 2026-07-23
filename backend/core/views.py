from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.contrib.auth import authenticate
from django.conf import settings
from .models import Workflow, Task, User
from .serializers import WorkflowSerializer, TaskSerializer, UserSerializer
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
            
            trigger_node = next((n for n in workflow.nodes if n.get("type") == "trigger"), None)
            if trigger_node:
                await advance_process(process_id=process_id, completed_node_id=trigger_node["id"])
                
        async_to_sync(_create_and_advance)()
        return Response({"process_id": process_id}, status=status.HTTP_201_CREATED)

class TaskViewSet(viewsets.ModelViewSet):
    queryset = Task.objects.all()
    serializer_class = TaskSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        return qs.filter(assigned_to=self.request.user)

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
                        context_update=form_data
                    )
                else:
                    await update_process_status(task.process_instance_id)
            
            async_to_sync(_update_and_advance)()
            return Response(self.get_serializer(task).data)
            
        return super().partial_update(request, *args, **kwargs)
