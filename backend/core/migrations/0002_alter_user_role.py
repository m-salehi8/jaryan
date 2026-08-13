from django.db import migrations, models


class Migration(migrations.Migration):
    """Sync User.role choices with the model.

    0001_initial carried the four legacy FastAPI-era roles. The Django models,
    the process engine (which falls back to "مدیر") and the frontend admin check
    all use the two-role scheme, so the migration state is what was stale.

    choices are enforced by Django/DRF validation, not by a database constraint,
    so this migration only updates state — no schema change is emitted.
    """

    dependencies = [
        ("core", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="user",
            name="role",
            field=models.CharField(
                choices=[("مدیر", "مدیر"), ("کارمند", "کارمند")], max_length=50
            ),
        ),
    ]
