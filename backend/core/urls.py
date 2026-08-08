from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    login_view, WorkflowViewSet, TaskViewSet, UserViewSet, 
    DepartmentViewSet, FormViewSet, me_view, dashboard_view, 
    process_list, analytics_users, analytics_forms, comments_view
)

router = DefaultRouter()
router.register(r'workflows', WorkflowViewSet, basename='workflow')
router.register(r'tasks', TaskViewSet, basename='task')
router.register(r'users', UserViewSet, basename='user')
router.register(r'departments', DepartmentViewSet, basename='department')
router.register(r'forms', FormViewSet, basename='form')

urlpatterns = [
    path('auth/login/', login_view, name='login'),
    path('auth/me/', me_view, name='me'),
    path('dashboard/', dashboard_view, name='dashboard'),
    path('processes/', process_list, name='processes'),
    path('analytics/users/', analytics_users, name='analytics_users'),
    path('analytics/forms/', analytics_forms, name='analytics_forms'),
    path('comments/', comments_view, name='comments'),
    path('', include(router.urls)),
]
