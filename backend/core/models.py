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


class AIProviderConfig(models.Model):
    """A switchable LLM endpoint: base URL + model name + API key.

    Deliberately *not* a TenantBaseModel. This is infrastructure configuration
    for the whole deployment, not per-organisation data, so it uses the plain
    manager and is reachable regardless of the current_org_id context var.

    Exactly one row may be active at a time; ``activate()`` is the only
    supported way to switch, and the partial unique constraint below makes a
    second active row a database error rather than a silent ambiguity.
    Everything the AI layer needs is read from the active row at call time, so
    switching models takes effect on the next request with no redeploy.
    """

    id = models.CharField(primary_key=True, default=uuid.uuid4, max_length=100)
    name = models.CharField(
        max_length=100,
        unique=True,
        help_text="Label used to switch between configs, e.g. 'agentrouter-opus'.",
    )
    base_url = models.URLField(
        max_length=500,
        help_text="OpenAI-compatible endpoint root, including /v1 and no trailing slash.",
    )
    model = models.CharField(
        max_length=200,
        help_text="Model identifier sent verbatim to the provider, e.g. 'claude-opus-4-8'.",
    )
    api_key = models.CharField(
        max_length=500,
        blank=True,
        help_text="Sent as the Bearer token. Masked in API responses; leave blank to fall back to EMERGENT_LLM_KEY.",
    )
    is_active = models.BooleanField(
        default=False,
        help_text="The one config the AI layer actually uses.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "AI provider config"
        verbose_name_plural = "AI provider configs"
        ordering = ("-is_active", "name")
        constraints = [
            models.UniqueConstraint(
                fields=["is_active"],
                condition=models.Q(is_active=True),
                name="unique_active_ai_provider_config",
            )
        ]

    def __str__(self):
        suffix = " (active)" if self.is_active else ""
        return f"{self.name} → {self.model}{suffix}"

    @property
    def masked_api_key(self) -> str:
        """Last four characters only — enough to tell two keys apart, not enough to use.

        A key short enough that the last four characters would reveal most of it
        is masked entirely: showing "…sk-B" for a 4-character key leaks the whole
        secret.
        """
        if not self.api_key:
            return ""
        if len(self.api_key) < 12:
            return "…"
        return f"…{self.api_key[-4:]}"

    def activate(self):
        """Make this the active config, deactivating whichever one was.

        Deactivating first is required, not stylistic: the partial unique
        constraint rejects a second active row, so the writes must happen in
        this order inside one transaction.
        """
        from django.db import transaction

        with transaction.atomic():
            AIProviderConfig.objects.filter(is_active=True).exclude(pk=self.pk).update(
                is_active=False
            )
            if not self.is_active:
                self.is_active = True
                self.save(update_fields=["is_active", "updated_at"])
        return self

    @classmethod
    def get_active(cls):
        return cls.objects.filter(is_active=True).first()
