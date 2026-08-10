from rest_framework import serializers
from .models import Workflow, Task, User, Department, Organization, Form, AIProviderConfig

class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = '__all__'

class UserSerializer(serializers.ModelSerializer):
    # Accepted on write, never returned on read. Without this the API silently
    # ignored the password field and created users who could not log in.
    password = serializers.CharField(
        write_only=True, required=False, min_length=6, max_length=128
    )

    class Meta:
        model = User
        fields = [
            'id', 'email', 'full_name', 'role', 'avatar_color',
            'department', 'manager', 'password',
        ]

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        user = User(**validated_data)
        if password:
            user.set_password(password)
        else:
            # No usable password rather than an empty one, so the account
            # cannot be logged into until a password is set.
            user.set_unusable_password()
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance

class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = '__all__'
        # org and id are assigned server-side from the caller's token in
        # perform_create. Leaving them writable would (a) make them required on
        # POST, breaking the client, and (b) let a caller plant a row in another
        # organisation.
        read_only_fields = ['id', 'org']

class FormSerializer(serializers.ModelSerializer):
    class Meta:
        model = Form
        fields = '__all__'
        read_only_fields = ['id', 'org', 'created_by']


class WorkflowSerializer(serializers.ModelSerializer):
    class Meta:
        model = Workflow
        fields = '__all__'
        read_only_fields = ['id', 'org', 'created_by']

class TaskSerializer(serializers.ModelSerializer):
    workflow_name = serializers.CharField(source='workflow.name', read_only=True)

    class Meta:
        model = Task
        fields = '__all__'
        # Tasks are created and routed by the process engine, never by API
        # clients. Locking these down stops a PATCH from reassigning a task to
        # someone else or moving it into another organisation.
        read_only_fields = [
            'org', 'workflow', 'process_instance_id', 'node_id',
            'assigned_to', 'created_at', 'updated_at',
        ]


class AIProviderConfigSerializer(serializers.ModelSerializer):
    """Read/write an LLM endpoint config without ever echoing the key back.

    ``api_key`` is write-only and ``api_key_preview`` returns the last four
    characters, which is enough to confirm which key is installed but not
    enough to reuse it. On update, an omitted key leaves the stored one intact
    so a PATCH of just the model name cannot silently wipe it.
    """

    api_key = serializers.CharField(
        write_only=True, required=False, allow_blank=True, max_length=500,
        style={'input_type': 'password'},
    )
    api_key_preview = serializers.CharField(source='masked_api_key', read_only=True)

    class Meta:
        model = AIProviderConfig
        fields = [
            'id', 'name', 'base_url', 'model',
            'api_key', 'api_key_preview', 'is_active',
            'created_at', 'updated_at',
        ]
        # is_active is toggled through the activate action, which enforces the
        # single-active invariant. Writing it directly would let a client
        # create a second active row and hit the constraint as a 500.
        read_only_fields = ['id', 'is_active', 'created_at', 'updated_at']

    def update(self, instance, validated_data):
        # Absent means "unchanged"; explicit "" means "clear it and fall back
        # to the environment". Both are legitimate, so distinguish them.
        if 'api_key' not in validated_data:
            validated_data.pop('api_key', None)
        return super().update(instance, validated_data)
