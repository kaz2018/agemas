from abc import ABC, abstractmethod
from typing import Optional

class StorageInterface(ABC):

    @abstractmethod
    def upload_image(self, file_obj, filename: str) -> str:
        """Uploads an image and returns the URL (or path)"""
        pass
