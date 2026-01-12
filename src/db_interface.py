from abc import ABC, abstractmethod
from typing import List, Dict, Optional, Any

class DatabaseInterface(ABC):

    @abstractmethod
    def get_user_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        pass

    @abstractmethod
    def create_user(self, user_data: Dict[str, Any]) -> bool:
        pass

    @abstractmethod
    def update_user_status(self, user_id: str, status: str) -> bool:
        pass

    @abstractmethod
    def get_all_posts(self) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    def get_post_by_id(self, post_id: str) -> Optional[Dict[str, Any]]:
        pass

    @abstractmethod
    def create_post(self, post_data: Dict[str, Any]) -> str:
        """Returns the new post_id"""
        pass

    @abstractmethod
    def update_post_status(self, post_id: str, status: str, decided_user_id: Optional[str] = None) -> bool:
        pass

    @abstractmethod
    def get_replies_by_post_id(self, post_id: str) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    def create_reply(self, reply_data: Dict[str, Any]) -> str:
        """Returns the new reply_id"""
        pass

    @abstractmethod
    def update_reply_status(self, reply_id: str, status: str) -> bool:
        pass

    @abstractmethod
    def log_action(self, action: str, user_id: Optional[str], post_id: Optional[str], reply_id: Optional[str], details: Dict[str, Any]) -> str:
        pass

    @abstractmethod
    def get_logs(self, filters: Dict[str, Any]) -> List[Dict[str, Any]]:
        pass
