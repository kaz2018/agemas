import os
import shutil
from src.storage_interface import StorageInterface

class MockStorage(StorageInterface):
    def __init__(self, base_dir: str = "data/images"):
        self.base_dir = base_dir
        if not os.path.exists(self.base_dir):
            os.makedirs(self.base_dir)

    def upload_image(self, file_obj, filename: str) -> str:
        # In a real scenario with streamlit, file_obj is UploadedFile.
        # We can read it and save it.
        filepath = os.path.join(self.base_dir, filename)

        with open(filepath, "wb") as f:
            f.write(file_obj.read())

        # In mock, we return the local path or a relative path that streamlit can serve?
        # Streamlit serves static files? No, not by default from arbitrary dirs.
        # But we can display images using st.image(path).
        return filepath
