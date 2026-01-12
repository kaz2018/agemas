import json
import os
import uuid
from datetime import datetime
from typing import List, Dict, Optional, Any
from src.db_interface import DatabaseInterface

class MockDB(DatabaseInterface):
    def __init__(self, data_dir: str = "data"):
        self.data_dir = data_dir
        self.users_file = os.path.join(data_dir, "users.json")
        self.posts_file = os.path.join(data_dir, "posts.json")
        self.replies_file = os.path.join(data_dir, "replies.json")
        self.logs_file = os.path.join(data_dir, "logs.json")

        self._ensure_files()

    def _ensure_files(self):
        if not os.path.exists(self.data_dir):
            os.makedirs(self.data_dir)

        for f in [self.users_file, self.posts_file, self.replies_file, self.logs_file]:
            if not os.path.exists(f):
                with open(f, 'w', encoding='utf-8') as file:
                    json.dump([], file)

    def _read_json(self, filepath: str) -> List[Dict[str, Any]]:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)

    def _write_json(self, filepath: str, data: List[Dict[str, Any]]):
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def get_user_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        users = self._read_json(self.users_file)
        for user in users:
            if user['name'] == name:
                return user
        return None

    def create_user(self, user_data: Dict[str, Any]) -> bool:
        users = self._read_json(self.users_file)
        # Check if exists
        if any(u['name'] == user_data['name'] for u in users):
            return False

        # Auto-generate ID if not provided (though in requirements admin sets it, let's auto-gen for mock simplicity or respect input)
        if 'user_id' not in user_data:
            user_data['user_id'] = f"user_{len(users)+1:03d}"

        users.append(user_data)
        self._write_json(self.users_file, users)
        return True

    def update_user_status(self, user_id: str, status: str) -> bool:
        users = self._read_json(self.users_file)
        for user in users:
            if user['user_id'] == user_id:
                user['status'] = status
                self._write_json(self.users_file, users)
                return True
        return False

    def get_all_posts(self) -> List[Dict[str, Any]]:
        return self._read_json(self.posts_file)

    def get_post_by_id(self, post_id: str) -> Optional[Dict[str, Any]]:
        posts = self._read_json(self.posts_file)
        for post in posts:
            if post['post_id'] == post_id:
                return post
        return None

    def create_post(self, post_data: Dict[str, Any]) -> str:
        posts = self._read_json(self.posts_file)
        new_id = f"post_{len(posts)+1:03d}"
        post_data['post_id'] = new_id
        post_data['created_at'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        if 'status' not in post_data:
            post_data['status'] = 'open'

        posts.append(post_data)
        self._write_json(self.posts_file, posts)
        return new_id

    def update_post_status(self, post_id: str, status: str, decided_user_id: Optional[str] = None) -> bool:
        posts = self._read_json(self.posts_file)
        for post in posts:
            if post['post_id'] == post_id:
                post['status'] = status
                if decided_user_id:
                    post['decided_user_id'] = decided_user_id
                    post['decided_at'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                self._write_json(self.posts_file, posts)
                return True
        return False

    def get_replies_by_post_id(self, post_id: str) -> List[Dict[str, Any]]:
        replies = self._read_json(self.replies_file)
        return [r for r in replies if r['post_id'] == post_id]

    def create_reply(self, reply_data: Dict[str, Any]) -> str:
        replies = self._read_json(self.replies_file)
        new_id = f"reply_{len(replies)+1:03d}"
        reply_data['reply_id'] = new_id
        reply_data['created_at'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        if 'status' not in reply_data:
            reply_data['status'] = 'proposed'

        replies.append(reply_data)
        self._write_json(self.replies_file, replies)
        return new_id

    def update_reply_status(self, reply_id: str, status: str) -> bool:
        replies = self._read_json(self.replies_file)
        for reply in replies:
            if reply['reply_id'] == reply_id:
                reply['status'] = status
                self._write_json(self.replies_file, replies)
                return True
        return False

    def log_action(self, action: str, user_id: Optional[str], post_id: Optional[str], reply_id: Optional[str], details: Dict[str, Any]) -> str:
        logs = self._read_json(self.logs_file)
        new_id = f"log_{len(logs)+1:03d}"
        log_entry = {
            "log_id": new_id,
            "action": action,
            "user_id": user_id,
            "post_id": post_id,
            "reply_id": reply_id,
            "details": details,
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
        logs.append(log_entry)
        self._write_json(self.logs_file, logs)
        return new_id

    def get_logs(self, filters: Dict[str, Any]) -> List[Dict[str, Any]]:
        logs = self._read_json(self.logs_file)
        # Simple filter implementation
        filtered_logs = logs
        if 'user_id' in filters and filters['user_id']:
            filtered_logs = [l for l in filtered_logs if l.get('user_id') == filters['user_id']]
        # Add more filters as needed
        return filtered_logs
