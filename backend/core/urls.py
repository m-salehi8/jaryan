from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import login_view, WorkflowViewSet, TaskViewSet

router = DefaultRouter()
router.register(r'workflows', WorkflowViewSet, basename='workflow')
router.register(r'tasks', TaskViewSet, basename='task')

urlpatterns = [
    path('auth/login/', login_view, name='login'),
    path('', include(router.urls)),
]
