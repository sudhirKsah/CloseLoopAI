"""List all users and optionally reset their passwords for local testing.

Usage:
    # List all users (no changes made)
    python reset_users.py

    # Reset a specific user's password
    python reset_users.py --email alice@example.com --password NewPass123

    # Reset ALL users to the same password
    python reset_users.py --all --password TestPass123

    # Also re-enable login for the affected users
    python reset_users.py --all --password TestPass123 --enable-login

Run from the backend directory with the venv activated:
    cd backend && source venv/bin/activate && python ../reset_users.py
"""

import argparse
import asyncio
import os
import sys
from pathlib import Path

# Ensure the backend app package is importable and its .env is found when run
# from the repo root. The Settings loader reads `.env` relative to CWD, so we
# chdir into backend/ before importing anything from the app package.
BACKEND_DIR = Path(__file__).resolve().parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))
os.chdir(BACKEND_DIR)

import bcrypt
from sqlalchemy import select, update

from app.db.session import SessionLocal
from app.models.core import User


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


async def list_users() -> list[User]:
    async with SessionLocal() as session:
        result = await session.execute(
            select(User).order_by(User.created_at)
        )
        return list(result.scalars().all())


async def reset_password(
    email: str | None, password: str, enable_login: bool, all_users: bool
) -> int:
    hashed = hash_password(password)
    async with SessionLocal() as session:
        if all_users:
            stmt = update(User).values(password_hash=hashed)
            if enable_login:
                stmt = stmt.values(is_login_enabled=True)
            result = await session.execute(stmt)
            await session.commit()
            return result.rowcount
        if not email:
            raise ValueError("Either --email or --all is required")
        stmt = update(User).where(User.email == email).values(password_hash=hashed)
        if enable_login:
            stmt = stmt.values(is_login_enabled=True)
        result = await session.execute(stmt)
        await session.commit()
        return result.rowcount


def print_users(users: list[User]) -> None:
    if not users:
        print("No users found.")
        return
    header = f"{'EMAIL':<40} {'DISPLAY NAME':<25} {'LOGIN':<7} {'ACTIVE':<7} {'HAS_PWD'}"
    print(header)
    print("-" * len(header))
    for u in users:
        print(
            f"{u.email:<40} {u.display_name:<25.25} "
            f"{'yes' if u.is_login_enabled else 'no':<7} "
            f"{'yes' if u.is_active else 'no':<7} "
            f"{'yes' if u.password_hash else 'no'}"
        )
    print(f"\nTotal: {len(users)} user(s)")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="List users and reset passwords for local testing."
    )
    parser.add_argument(
        "--email", help="Email of the user to reset (ignored if --all)"
    )
    parser.add_argument("--password", help="New password to set")
    parser.add_argument(
        "--all", action="store_true", help="Reset ALL users to the given password"
    )
    parser.add_argument(
        "--enable-login",
        action="store_true",
        help="Also set is_login_enabled=True for affected users",
    )
    args = parser.parse_args()

    if args.password:
        if not args.email and not args.all:
            parser.error("--password requires either --email or --all")
        count = asyncio.run(
            reset_password(
                args.email, args.password, args.enable_login, args.all
            )
        )
        scope = "all users" if args.all else f"'{args.email}'"
        print(f"Reset password for {count} user(s) ({scope}).")
        if args.enable_login:
            print("Also enabled login for affected user(s).")
        print()

    users = asyncio.run(list_users())
    print_users(users)


if __name__ == "__main__":
    main()
