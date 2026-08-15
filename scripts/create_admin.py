"""
Create a superuser for the management portal.

The password is generated inside the container and printed once. It is never
passed as an argument, so it does not land in the SSH command line, the shell
history, or the process table — only in this script's stdout.

Run:  docker cp scripts/create_admin.py <backend>:/app/ && docker exec -w /app <backend> python create_admin.py <username>
"""

import os
import secrets
import string
import sys

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "enfant_backend.settings")
django.setup()

from django.contrib.auth import get_user_model  # noqa: E402

USERNAME = sys.argv[1] if len(sys.argv) > 1 else "devadmin"

# Ambiguous characters left out — this gets typed by hand and read off a screen.
ALPHABET = (
    "".join(c for c in string.ascii_letters + string.digits if c not in "O0Il1")
    + "!@#$%^&*-_=+"
)


def generate_password(length=20):
    return "".join(secrets.choice(ALPHABET) for _ in range(length))


def main():
    User = get_user_model()
    password = generate_password()

    user = User.objects.filter(username=USERNAME).first()
    if user:
        print(f"'{USERNAME}' already exists (id={user.pk}) — refusing to touch it.")
        print("Pass a different username as the first argument.")
        return

    user = User.objects.create_superuser(username=USERNAME, email="", password=password)
    print(f"created id={user.pk}")
    print(f"  username: {USERNAME}")
    print(f"  password: {password}")
    print(f"  is_staff={user.is_staff} is_superuser={user.is_superuser} is_active={user.is_active}")


if __name__ == "__main__":
    main()
