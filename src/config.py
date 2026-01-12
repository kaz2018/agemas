import os
from dotenv import load_dotenv

load_dotenv()

USE_MOCK = os.getenv("USE_MOCK", "True").lower() == "true"

if USE_MOCK:
    from src.mock_db import MockDB
    from src.mock_storage import MockStorage

    db = MockDB()
    storage = MockStorage()
else:
    from src.real_db import GoogleSheetsDB
    from src.real_storage import GCSStorage

    # Credentials paths would be env vars
    CREDS_PATH = os.getenv("GOOGLE_CREDENTIALS_PATH", "credentials.json")
    BUCKET_NAME = os.getenv("GCS_BUCKET_NAME", "agemas-images")

    db = GoogleSheetsDB(CREDS_PATH)
    storage = GCSStorage(BUCKET_NAME, CREDS_PATH)
