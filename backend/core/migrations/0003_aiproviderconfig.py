import uuid

from django.db import migrations, models


class Migration(migrations.Migration):
    """Add AIProviderConfig — the switchable LLM endpoint table.

    Before this, the provider/model/key triple lived only in environment
    variables read at import time (services/ai_service.py), so changing models
    meant editing backend/.env and restarting the process. This table makes the
    active config a row, so it can be switched at runtime.

    Not a tenant model: no org FK, deployment-wide configuration.
    """

    dependencies = [
        ("core", "0002_alter_user_role"),
    ]

    operations = [
        migrations.CreateModel(
            name="AIProviderConfig",
            fields=[
                (
                    "id",
                    models.CharField(
                        default=uuid.uuid4,
                        max_length=100,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                (
                    "name",
                    models.CharField(
                        help_text="Label used to switch between configs, e.g. 'agentrouter-opus'.",
                        max_length=100,
                        unique=True,
                    ),
                ),
                (
                    "base_url",
                    models.URLField(
                        help_text="OpenAI-compatible endpoint root, including /v1 and no trailing slash.",
                        max_length=500,
                    ),
                ),
                (
                    "model",
                    models.CharField(
                        help_text="Model identifier sent verbatim to the provider, e.g. 'claude-opus-4-8'.",
                        max_length=200,
                    ),
                ),
                (
                    "api_key",
                    models.CharField(
                        blank=True,
                        help_text="Sent as the Bearer token. Masked in API responses; leave blank to fall back to EMERGENT_LLM_KEY.",
                        max_length=500,
                    ),
                ),
                (
                    "is_active",
                    models.BooleanField(
                        default=False,
                        help_text="The one config the AI layer actually uses.",
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "AI provider config",
                "verbose_name_plural": "AI provider configs",
                "ordering": ("-is_active", "name"),
            },
        ),
        migrations.AddConstraint(
            model_name="aiproviderconfig",
            constraint=models.UniqueConstraint(
                condition=models.Q(("is_active", True)),
                fields=("is_active",),
                name="unique_active_ai_provider_config",
            ),
        ),
    ]
