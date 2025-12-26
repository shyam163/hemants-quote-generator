#!/usr/bin/env python3
"""
Database migration script for adding username field to User model.
Migrates existing email-based logins to username-based logins.

Run this script ONCE after deploying the new code:
    python migrate_db.py
"""

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'instance', 'quotes.db')

def migrate():
    """Add username column and migrate existing users"""

    # Check if database exists
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}")
        print("If this is a fresh install, just run the app and the database will be created.")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        # Check if username column already exists
        cursor.execute("PRAGMA table_info(user)")
        columns = [col[1] for col in cursor.fetchall()]

        if 'username' in columns:
            print("Migration already applied - username column exists")

            # Check if there are users without username
            cursor.execute("SELECT id, email FROM user WHERE username IS NULL OR username = ''")
            users_without_username = cursor.fetchall()

            if users_without_username:
                print(f"Found {len(users_without_username)} users without username, migrating...")
                for user_id, email in users_without_username:
                    # Extract username from email (part before @)
                    if email:
                        username = email.split('@')[0].lower()
                        # Handle potential duplicates by appending id
                        cursor.execute("SELECT COUNT(*) FROM user WHERE username = ? AND id != ?", (username, user_id))
                        if cursor.fetchone()[0] > 0:
                            username = f"{username}_{user_id}"
                        cursor.execute("UPDATE user SET username = ? WHERE id = ?", (username, user_id))
                        print(f"  User {user_id}: {email} -> username: {username}")
                    else:
                        # No email, use user_<id> as username
                        username = f"user_{user_id}"
                        cursor.execute("UPDATE user SET username = ? WHERE id = ?", (username, user_id))
                        print(f"  User {user_id}: (no email) -> username: {username}")

                conn.commit()
                print("Migration complete!")
            else:
                print("All users already have usernames")
            return

        # Add username column
        print("Adding username column...")
        cursor.execute("ALTER TABLE user ADD COLUMN username VARCHAR(80)")

        # Migrate existing users: set username from email (part before @)
        cursor.execute("SELECT id, email FROM user")
        users = cursor.fetchall()

        print(f"Migrating {len(users)} existing users...")
        used_usernames = set()

        for user_id, email in users:
            if email:
                base_username = email.split('@')[0].lower()
                username = base_username
                counter = 1
                # Handle duplicates
                while username in used_usernames:
                    username = f"{base_username}_{counter}"
                    counter += 1
                used_usernames.add(username)
            else:
                username = f"user_{user_id}"
                used_usernames.add(username)

            cursor.execute("UPDATE user SET username = ? WHERE id = ?", (username, user_id))
            print(f"  {email or '(no email)'} -> {username}")

        conn.commit()
        print("\nMigration complete!")
        print("\nUsers can now log in with their username (shown above).")
        print("Email is now a separate contact field that can be edited in profile settings.")

    except Exception as e:
        conn.rollback()
        print(f"Migration failed: {e}")
        raise
    finally:
        conn.close()

def migrate_equipments():
    """Add equipment columns to quote table"""

    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        # Check if columns already exist
        cursor.execute("PRAGMA table_info(quote)")
        columns = [col[1] for col in cursor.fetchall()]

        columns_to_add = []
        if 'equipments_enabled' not in columns:
            columns_to_add.append(('equipments_enabled', 'BOOLEAN DEFAULT 0'))
        if 'equipment_headers' not in columns:
            columns_to_add.append(('equipment_headers', 'TEXT'))
        if 'equipment_items' not in columns:
            columns_to_add.append(('equipment_items', 'TEXT'))

        if not columns_to_add:
            print("Equipment columns already exist")
            return

        print(f"Adding {len(columns_to_add)} equipment column(s)...")
        for col_name, col_def in columns_to_add:
            cursor.execute(f"ALTER TABLE quote ADD COLUMN {col_name} {col_def}")
            print(f"  Added: {col_name}")

        conn.commit()
        print("Equipment migration complete!")

    except Exception as e:
        conn.rollback()
        print(f"Equipment migration failed: {e}")
        raise
    finally:
        conn.close()


def migrate_hide_labor():
    """Add hide_labor column to quote table"""

    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        # Check if column already exists
        cursor.execute("PRAGMA table_info(quote)")
        columns = [col[1] for col in cursor.fetchall()]

        if 'hide_labor' in columns:
            print("hide_labor column already exists")
            return

        print("Adding hide_labor column...")
        cursor.execute("ALTER TABLE quote ADD COLUMN hide_labor BOOLEAN DEFAULT 0")
        print("  Added: hide_labor")

        conn.commit()
        print("Hide labor migration complete!")

    except Exception as e:
        conn.rollback()
        print(f"Hide labor migration failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == '__main__':
    migrate()
    migrate_equipments()
    migrate_hide_labor()
