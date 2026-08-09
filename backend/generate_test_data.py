import asyncio
import os
import django

from seed import seed as seed_basic
from seed_ai_workflow import seed_ai_workflow
from seed_heavy import seed_heavy

async def run_all_seeds():
    print("--- Running Basic Seed ---")
    await seed_basic()
    
    print("--- Running AI Workflow Seed ---")
    await seed_ai_workflow()
    
    print("--- Running Heavy Seed ---")
    await seed_heavy()

def create_superuser():
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'jaryan.settings')
    django.setup()
    from core.models import User
    
    print("--- Creating Superuser ---")
    if not User.objects.filter(email='admin@jaryan.com').exists():
        User.objects.create_superuser('admin@jaryan.com', 'admin123', full_name='System Admin')
        print("Superuser created: admin@jaryan.com / admin123")
    else:
        print("Superuser already exists.")

if __name__ == "__main__":
    print("Starting comprehensive test data generation...")
    asyncio.run(run_all_seeds())
    create_superuser()
    print("--- All Data Successfully Seeded ---")
