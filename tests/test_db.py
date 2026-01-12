import unittest
from src.mock_db import MockDB
import os
import shutil

class TestMockDB(unittest.TestCase):
    def setUp(self):
        self.test_dir = 'tests/test_data'
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)
        os.makedirs(self.test_dir)
        self.db = MockDB(self.test_dir)

    def tearDown(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)

    def test_create_user(self):
        user_data = {
            'user_id': 'u1', 'name': 'test', 'password_hash': 'hash', 'status': 'active', 'created_at': 'now'
        }
        self.assertTrue(self.db.create_user(user_data))
        self.assertEqual(self.db.get_user_by_name('test')['user_id'], 'u1')

    def test_create_post(self):
        post_data = {
            'user_id': 'u1', 'user_name': 'test', 'title': 'title',
            'description': 'desc', 'category': 'cat', 'images': [], 'status': 'open'
        }
        pid = self.db.create_post(post_data)
        self.assertTrue(pid.startswith('post_'))
        self.assertEqual(self.db.get_post_by_id(pid)['title'], 'title')

if __name__ == '__main__':
    unittest.main()
