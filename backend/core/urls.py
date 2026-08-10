from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    login_view, WorkflowViewSet, TaskViewSet, UserViewSet,
    DepartmentViewSet, FormViewSet, me_view, dashboard_view,
    process_list, analytics_users, analytics_forms, comments_view,
    AIProviderConfigViewSet, ai_generate_workflow, ai_session
)

router = DefaultRouter()
router.register(r'workflows', WorkflowViewSet, basename='workflow')
router.register(r'tasks', TaskViewSet, basename='task')
router.register(r'users', UserViewSet, basename='user')
router.register(r'departments', DepartmentViewSet, basename='department')
router.register(r'forms', FormViewSet, basename='form')
router.register(r'ai/providers', AIProviderConfigViewSet, basename='ai-provider')

urlpatterns = [
    path('auth/login/', login_view, name='login'),
    path('auth/me/', me_view, name='me'),
    path('dashboard/', dashboard_view, name='dashboard'),
    path('processes/', process_list, name='processes'),
    path('analytics/users/', analytics_users, name='analytics_users'),
    path('analytics/forms/', analytics_forms, name='analytics_forms'),
    path('comments/', comments_view, name='comments'),
    # Registered before the router so 'ai/generate-workflow/' is not shadowed
    # by the 'ai/providers' viewset routes.
    path('ai/generate-workflow/', ai_generate_workflow, name='ai_generate_workflow'),
    path('ai/sessions/<str:session_id>/', ai_session, name='ai_session'),
    path('', include(router.urls)),
]
