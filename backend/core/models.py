import uuid
from contextvars import ContextVar
from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin

# The ContextVar that holds the current organization ID
current_org_id = ContextVar('current_org_id', default=None)

class TenantManager(models.Manager):
    """
    Custom manager that automatically filters all queries by the current organization,
    ensuring multi-tenant row-level security.
    """
    def get_queryset(self):
        qs = super().get_queryset()
        org_id = current_org_id.get()
        if org_id:
            # Filter by the organization context variable
            return qs.filter(org_id=org_id)
        return qs

    def get_all_tenants(self):
        """Bypass the tenant filter (e.g. for superadmin or background scripts)"""
        return super().get_queryset()

class Organization(models.Model):
    id = models.CharField(primary_key=True, default=uuid.uuid4, max_length=100)
    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True)

    def __str__(self):
        return self.name

class TenantBaseModel(models.Model):
    id = models.CharField(primary_key=True, default=uuid.uuid4, max_length=100)
    org = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="%(class)s_set")
    
    # Use the TenantManager for default queries
    objects = TenantManager()
    
    class Meta:
        abstract = True

class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('The Email field must be set')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        if password:
            user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('role', 'مدیر')
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        
        # If the user doesn't pass an organization for superuser, 
        # we might need to create a default one or just allow it.
        # But 'org' is a required ForeignKey. We will handle it by 
        # creating a System organization if none provided.
        if not extra_fields.get('org'):
            org, _ = Organization.objects.get_or_create(name="System", slug="system")
            extra_fields['org'] = org

        return self.create_user(email, password, **extra_fields)

class Department(TenantBaseModel):
    name = models.CharField(max_length=255)
    parent = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='sub_departments')
    manager = models.ForeignKey('User', on_delete=models.SET_NULL, null=True, blank=True, related_name='managed_departments')

    def __str__(self):
        return self.name

class TenantUserManager(UserManager, TenantManager):
    pass

class User(AbstractBaseUser, PermissionsMixin, TenantBaseModel):
    ROLE_CHOICES = (
        ('مدیر', 'مدیر'),
        ('کارمند', 'کارمند'),
    )
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=255)
    role = models.CharField(max_length=50, choices=ROLE_CHOICES)
    avatar_color = models.CharField(max_length=7, default="#737373")
    department = models.ForeignKey(Department, on_delete=models.SET_NULL, null=True, blank=True)
    manager = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True)
    
    is_staff = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['full_name', 'role', 'org']

    # We will override objects to inherit from TenantManager down below.
    objects = TenantUserManager()
    
    def __str__(self):
        return self.email

class Workflow(TenantBaseModel):
    STATUS_CHOICES = (
        ('draft', 'Draft'),
        ('published', 'Published'),
        ('archived', 'Archived'),
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    trigger_type = models.CharField(max_length=50, default='manual')
    cron_expression = models.CharField(max_length=100, null=True, blank=True)
    last_triggered_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    
    # Store workflow schema as JSON
    nodes = models.JSONField(default=list)
    edges = models.JSONField(default=list)

    def __str__(self):
        return self.name

class Form(TenantBaseModel):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    fields = models.JSONField(default=list)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)

    def __str__(self):
        return self.name

class Task(TenantBaseModel):
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('done', 'Done'),
    )
    workflow = models.ForeignKey(Workflow, on_delete=models.CASCADE)
    process_instance_id = models.CharField(max_length=255, help_text="MongoDB ProcessInstance ID")
    node_id = models.CharField(max_length=100)
    assigned_to = models.ForeignKey(User, on_delete=models.CASCADE)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    
    # Dynamic JSON data
    form_data = models.JSONField(default=dict, blank=True)
    draft_data = models.JSONField(default=dict, blank=True)
    field_permissions = models.JSONField(default=dict, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"Task {self.id} - {self.status}"
