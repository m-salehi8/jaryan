import os
import sys
import argparse

# Setup Django environment
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "jaryan.settings")

import django
django.setup()

from django.contrib.auth import get_user_model

User = get_user_model()

def main():
    parser = argparse.ArgumentParser(description="Create a superuser for the Jaryan project.")
    parser.add_argument("--email", default="admin@jaryan.ir", help="Email for the superuser")
    parser.add_argument("--password", default="admin123", help="Password for the superuser")
    parser.add_argument("--first-name", default="Admin", help="First name")
    parser.add_argument("--last-name", default="System", help="Last name")
    args = parser.parse_args()

    if User.objects.filter(email=args.email).exists():
        print(f"User with email '{args.email}' already exists.")
        user = User.objects.get(email=args.email)
        user.set_password(args.password)
        user.is_superuser = True
        user.is_staff = True
        user.role = 'مدیر'
        user.save()
        print(f"Updated existing user '{args.email}' to superuser and updated password.")
    else:
        print(f"Creating new superuser '{args.email}'...")
        try:
            user = User.objects.create_superuser(
                email=args.email,
                password=args.password,
                first_name=args.first_name,
                last_name=args.last_name
            )
            print(f"Superuser '{args.email}' created successfully.")
        except Exception as e:
            print(f"Error creating superuser: {e}")

if __name__ == "__main__":
    main()
