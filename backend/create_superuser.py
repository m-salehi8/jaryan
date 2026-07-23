import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'jaryan.settings')
django.setup()

from core.models import User

if not User.objects.filter(email='admin@jaryan.com').exists():
    User.objects.create_superuser('admin@jaryan.com', 'admin123', full_name='System Admin')
    print("Superuser created: admin@jaryan.com / admin123")
else:
    print("Superuser already exists.")
