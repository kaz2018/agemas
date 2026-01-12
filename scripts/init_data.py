from src.config import db
from src.auth import hash_password
import os

def init_data():
    print("Initializing test data...")

    # Create Admin User
    admin_pass = hash_password("admin123")
    if db.create_user({
        "user_id": "user_000",
        "name": "admin",
        "role": "admin",
        "password_hash": admin_pass,
        "status": "active",
        "created_at": "2025-01-01 00:00:00"
    }):
        print("Created admin user.")
    else:
        # Update existing admin to have role if missing (for dev iterations)
        pass # MockDB create checks existence by name, we won't complicate mock update here.
        print("Admin user already exists.")

    # Create User 1
    u1_pass = hash_password("password123")
    if db.create_user({
        "user_id": "user_001",
        "name": "田中花子",
        "role": "user",
        "password_hash": u1_pass,
        "status": "active",
        "created_at": "2026-01-01 10:00:00"
    }):
        print("Created user 田中花子.")

    # Create User 2
    u2_pass = hash_password("password123")
    if db.create_user({
        "user_id": "user_002",
        "name": "佐藤太郎",
        "role": "user",
        "password_hash": u2_pass,
        "status": "active",
        "created_at": "2026-01-02 11:00:00"
    }):
        print("Created user 佐藤太郎.")

    # Create Post 1 (by Tanaka)
    if not db.get_all_posts():
        post_id = db.create_post({
            "user_id": "user_001",
            "user_name": "田中花子",
            "title": "冬服セット",
            "description": "120cm〜130cmサイズの冬服です。保育園で着ていた上着とズボンです。",
            "category": "子ども用品",
            "images": [], # Empty for now
            "status": "open",
            "created_at": "2026-01-11 10:30:00"
        })
        print(f"Created post {post_id}.")

        # Create Reply 1 (by Sato)
        db.create_reply({
            "post_id": post_id,
            "user_id": "user_002",
            "user_name": "佐藤太郎",
            "message": "欲しいです！",
            "image": None,
            "status": "proposed",
            "created_at": "2026-01-11 11:00:00"
        })
        print("Created reply.")

if __name__ == "__main__":
    init_data()
