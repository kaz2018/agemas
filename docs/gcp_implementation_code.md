# あげますサイト - GCP サービスアカウント認証実装コード

## ファイル構成
```
agari-app/
├── .env                           # 環境変数（.gitignore に追加）
├── .gitignore
├── service-account-key.json       # サービスアカウントキー（.gitignore に追加）
├── requirements.txt
├── app.py                         # メイン Streamlit アプリ
├── config.py                      # 設定・認証管理
└── gcp_utils.py                   # GCP 関連ユーティリティ
```

---

## 1. .env ファイル（開発環境用）

```bash
# .env
GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json
GCP_PROJECT_ID=your-project-id
GCS_BUCKET_NAME=agemas-images

# Google Sheets ID（各スプレッドシート）
MASTER_USERS_SHEET_ID=1DcpgR2Ksscj1X_EOPBFbRbiqozT84lMaGV9UMO16kek
POSTS_SHEET_ID=1T-K9XiEkz3lRjXkiQqLlRRqziA9Bj6a142WU0nf8eX0
POSTS_REPLIES_SHEET_ID=1I6vnan3Io8KA9MAKLCemW20KEnHqaQhCIUDlZj5sbM0
LOGS_SHEET_ID=11h3sfe3hkqRf_RlqDvSTPHQRWPLKr0PetmszL2SgYLs
```

**重要**: `.gitignore` に以下を追加
```
.env
service-account-key.json
*.json  # JSON ファイル全般（キーを誤ってコミットしないようにするため）
```

---

## 2. requirements.txt

```
streamlit==1.52.3
google-cloud-storage==2.17.0
gspread==6.2.1
google-auth==2.38.0
google-auth-oauthlib==1.2.1
bcrypt==5.0.0
pillow==12.1.0
python-dotenv==1.0.1
```

---

## 3. config.py（設定・認証管理）

```python
import os
from pathlib import Path
from dotenv import load_dotenv

# .env ファイルから環境変数を読み込み
load_dotenv()

# GCP 設定
GCP_PROJECT_ID = os.getenv('GCP_PROJECT_ID')
GCS_BUCKET_NAME = os.getenv('GCS_BUCKET_NAME')
GOOGLE_APPLICATION_CREDENTIALS = os.getenv(
    'GOOGLE_APPLICATION_CREDENTIALS',
    './service-account-key.json'
)

# Google Sheets ID
MASTER_USERS_SHEET_ID = os.getenv('MASTER_USERS_SHEET_ID')
POSTS_SHEET_ID = os.getenv('POSTS_SHEET_ID')
POSTS_REPLIES_SHEET_ID = os.getenv('POSTS_REPLIES_SHEET_ID')
LOGS_SHEET_ID = os.getenv('LOGS_SHEET_ID')

# ローカル開発か Cloud Run か判定
IS_CLOUD_RUN = os.getenv('K_SERVICE') is not None

# パス設定
PROJECT_ROOT = Path(__file__).parent
SERVICE_ACCOUNT_KEY_PATH = PROJECT_ROOT / GOOGLE_APPLICATION_CREDENTIALS

# 環境変数の検証
def validate_config():
    """必要な環境変数が設定されているか確認"""
    required_vars = [
        'GCP_PROJECT_ID',
        'GCS_BUCKET_NAME',
        'MASTER_USERS_SHEET_ID',
        'POSTS_SHEET_ID',
        'POSTS_REPLIES_SHEET_ID',
        'LOGS_SHEET_ID',
    ]
    
    missing = [var for var in required_vars if not os.getenv(var)]
    if missing:
        raise EnvironmentError(f"Missing environment variables: {', '.join(missing)}")
    
    if not IS_CLOUD_RUN and not SERVICE_ACCOUNT_KEY_PATH.exists():
        raise FileNotFoundError(
            f"Service account key not found: {SERVICE_ACCOUNT_KEY_PATH}\n"
            "Please ensure service-account-key.json is in the project root."
        )

# 起動時に検証
validate_config()
```

---

## 4. gcp_utils.py（GCP 関連ユーティリティ）

```python
import os
from google.oauth2 import service_account
from google.cloud import storage
import gspread
from datetime import datetime, timedelta
import streamlit as st

from config import (
    GOOGLE_APPLICATION_CREDENTIALS,
    GCS_BUCKET_NAME,
    MASTER_USERS_SHEET_ID,
    POSTS_SHEET_ID,
    POSTS_REPLIES_SHEET_ID,
    LOGS_SHEET_ID,
)

# ============================================================================
# GCS（Google Cloud Storage）初期化
# ============================================================================

@st.cache_resource
def get_gcs_client():
    """GCS クライアントを取得（キャッシュ）"""
    try:
        credentials = service_account.Credentials.from_service_account_file(
            GOOGLE_APPLICATION_CREDENTIALS,
            scopes=['https://www.googleapis.com/auth/devstorage.read_write']
        )
        return storage.Client(credentials=credentials)
    except FileNotFoundError:
        st.error(
            f"Service account key not found: {GOOGLE_APPLICATION_CREDENTIALS}\n"
            "Please ensure the key file is in the correct location."
        )
        st.stop()

def upload_image_to_gcs(file, file_name):
    """
    GCS に画像をアップロード
    
    Args:
        file: Streamlit UploadedFile オブジェクト
        file_name: GCS に保存するファイル名
    
    Returns:
        署名付き URL（24時間有効）
    """
    try:
        client = get_gcs_client()
        bucket = client.bucket(GCS_BUCKET_NAME)
        blob = bucket.blob(file_name)
        
        # ファイルをアップロード
        blob.upload_from_string(
            file.read(),
            content_type=file.type
        )
        
        # 署名付き URL を生成（24時間有効）
        signed_url = blob.generate_signed_url(
            version="v4",
            expiration=timedelta(hours=24),
            method="GET"
        )
        
        return signed_url
    except Exception as e:
        st.error(f"Failed to upload image: {str(e)}")
        return None

# ============================================================================
# Google Sheets 初期化
# ============================================================================

@st.cache_resource
def get_gspread_client():
    """gspread クライアントを取得（キャッシュ）"""
    try:
        credentials = service_account.Credentials.from_service_account_file(
            GOOGLE_APPLICATION_CREDENTIALS,
            scopes=[
                'https://spreadsheets.google.com/feeds',
                'https://www.googleapis.com/auth/drive'
            ]
        )
        return gspread.authorize(credentials)
    except FileNotFoundError:
        st.error(
            f"Service account key not found: {GOOGLE_APPLICATION_CREDENTIALS}"
        )
        st.stop()

# ============================================================================
# Google Sheets アクセス関数
# ============================================================================

def get_master_users_worksheet():
    """master_users シートを取得"""
    gc = get_gspread_client()
    sh = gc.open_by_key(MASTER_USERS_SHEET_ID)
    return sh.worksheet('master_users')

def get_posts_worksheet():
    """posts シートを取得"""
    gc = get_gspread_client()
    sh = gc.open_by_key(POSTS_SHEET_ID)
    return sh.worksheet('posts')

def get_posts_replies_worksheet():
    """posts_replies シートを取得"""
    gc = get_gspread_client()
    sh = gc.open_by_key(POSTS_REPLIES_SHEET_ID)
    return sh.worksheet('posts_replies')

def get_logs_worksheet():
    """logs シートを取得"""
    gc = get_gspread_client()
    sh = gc.open_by_key(LOGS_SHEET_ID)
    return sh.worksheet('logs')

# ============================================================================
# ユーザー認証
# ============================================================================

def get_all_users():
    """全ユーザーを取得"""
    try:
        ws = get_master_users_worksheet()
        return ws.get_all_records()
    except Exception as e:
        st.error(f"Failed to fetch users: {str(e)}")
        return []

def verify_password(username, password, password_hash):
    """
    パスワードを検証（bcrypt 使用）
    
    Args:
        username: ユーザー名（確認用）
        password: 入力パスワード
        password_hash: Sheets に保存されているハッシュ
    
    Returns:
        bool: 一致したら True
    """
    import bcrypt
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except Exception:
        return False

# ============================================================================
# ログ記録
# ============================================================================

def log_action(action, user_id=None, post_id=None, reply_id=None, details=None):
    """
    ログを記録
    
    Args:
        action: アクション名（例: 'post_created', 'reply_created'）
        user_id: ユーザー ID
        post_id: 投稿 ID
        reply_id: 返信 ID
        details: 詳細情報（辞書）
    """
    try:
        ws = get_logs_worksheet()
        log_id = f"log_{int(datetime.now().timestamp())}"
        
        row = [
            log_id,
            action,
            user_id or '',
            post_id or '',
            reply_id or '',
            str(details) if details else '',
            datetime.now().isoformat()
        ]
        
        ws.append_row(row)
    except Exception as e:
        st.error(f"Failed to log action: {str(e)}")

# ============================================================================
# エラーハンドリング
# ============================================================================

def handle_gcp_error(error):
    """GCP 関連エラーを処理"""
    error_msg = str(error).lower()
    
    if '403' in error_msg or 'permission' in error_msg:
        return "権限不足です。サービスアカウントの権限設定を確認してください。"
    elif '404' in error_msg:
        return "リソースが見つかりません。スプレッドシート ID またはバケット名を確認してください。"
    elif 'unauthenticated' in error_msg:
        return "認証に失敗しました。サービスアカウントキーを確認してください。"
    else:
        return f"GCP エラー: {str(error)}"
```

---

## 5. app.py（メイン Streamlit アプリ - 認証部分）

```python
import streamlit as st
from config import validate_config, IS_CLOUD_RUN
from gcp_utils import (
    get_all_users,
    verify_password,
    log_action,
    handle_gcp_error,
)
import bcrypt

# ============================================================================
# ページ設定
# ============================================================================

st.set_page_config(
    page_title="あげますサイト",
    page_icon="🎁",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# ============================================================================
# セッション初期化
# ============================================================================

if 'user_id' not in st.session_state:
    st.session_state.user_id = None
if 'user_name' not in st.session_state:
    st.session_state.user_name = None
if 'is_admin' not in st.session_state:
    st.session_state.is_admin = False

# ============================================================================
# ログイン画面
# ============================================================================

def login_page():
    """ログイン画面"""
    col1, col2, col3 = st.columns([1, 2, 1])
    
    with col2:
        st.title("🎁 あげますサイト")
        st.markdown(
            "<p style='text-align: center; color: #666;'>"
            "地域おさがり共有プラットフォーム"
            "</p>",
            unsafe_allow_html=True
        )
        
        st.markdown("---")
        
        username = st.text_input("ユーザー名（実名）", key="login_username")
        password = st.text_input("パスワード", type="password", key="login_password")
        
        col_login, col_spacer = st.columns([1, 3])
        with col_login:
            if st.button("ログイン", use_container_width=True):
                try:
                    users = get_all_users()
                    
                    # ユーザーを検索
                    user = next((u for u in users if u['name'] == username), None)
                    
                    if user is None:
                        st.error("ユーザーが見つかりません")
                    elif user['status'] == 'suspended':
                        st.error("このアカウントは利用停止中です")
                    elif verify_password(username, password, user['password_hash']):
                        st.session_state.user_id = user['user_id']
                        st.session_state.user_name = user['name']
                        st.session_state.is_admin = user.get('is_admin', False)
                        
                        # ログイン記録
                        log_action('login', user_id=user['user_id'])
                        
                        st.success("ログインしました！")
                        st.rerun()
                    else:
                        st.error("パスワードが正しくありません")
                
                except Exception as e:
                    error_msg = handle_gcp_error(e)
                    st.error(error_msg)
        
        st.markdown("---")
        st.markdown(
            "<p style='text-align: center; font-size: 12px; color: #999;'>"
            "利用規約 | プライバシーポリシー"
            "</p>",
            unsafe_allow_html=True
        )

# ============================================================================
# ダッシュボード（ログイン後）
# ============================================================================

def dashboard_page():
    """ダッシュボード"""
    col1, col2, col3 = st.columns([1, 1, 1])
    
    with col1:
        st.title("🎁 あげますサイト")
    with col3:
        if st.button("ログアウト", key="logout"):
            st.session_state.user_id = None
            st.session_state.user_name = None
            st.session_state.is_admin = False
            log_action('logout', user_id=st.session_state.user_id)
            st.rerun()
    
    st.markdown(f"ようこそ、**{st.session_state.user_name}** さん")
    st.markdown("---")
    
    # タブナビゲーション
    tab1, tab2, tab3 = st.tabs(["投稿一覧", "マイページ", "新規投稿"])
    
    with tab1:
        st.subheader("投稿一覧")
        st.info("投稿一覧の実装はここに追加")
    
    with tab2:
        st.subheader("マイページ")
        st.info("マイページの実装はここに追加")
    
    with tab3:
        st.subheader("新規投稿")
        st.info("新規投稿フォームの実装はここに追加")
    
    # 管理者画面
    if st.session_state.is_admin:
        st.markdown("---")
        st.subheader("👨‍💼 管理者メニュー")
        admin_tab1, admin_tab2 = st.tabs(["ログ検索", "ユーザー管理"])
        
        with admin_tab1:
            st.info("ログ検索の実装はここに追加")
        
        with admin_tab2:
            st.info("ユーザー管理の実装はここに追加")

# ============================================================================
# メイン処理
# ============================================================================

def main():
    """メイン処理"""
    try:
        validate_config()
    except Exception as e:
        st.error(f"設定エラー: {str(e)}")
        st.stop()
    
    # 環境確認（開発時のみ表示）
    if not IS_CLOUD_RUN and st.secrets.get('debug_mode', False):
        with st.sidebar:
            st.info(f"🔧 ローカル開発モード")
    
    # ページ分岐
    if st.session_state.user_id is None:
        login_page()
    else:
        dashboard_page()

if __name__ == "__main__":
    main()
```

---

## 6. 開発環境でのテスト手順

### ステップ 1: 依存関係をインストール
```bash
pip install -r requirements.txt
```

### ステップ 2: .env ファイルを作成
```bash
# .env を編集（実際のスプレッドシート ID を入力）
cp .env.example .env
```

### ステップ 3: service-account-key.json を配置
```bash
# GCP コンソールからダウンロードしたキーファイルをプロジェクトルートに配置
cp ~/Downloads/service-account-key.json ./
```

### ステップ 4: ローカルで実行
```bash
streamlit run app.py
```

---

## 7. Cloud Run へのデプロイ

### Dockerfile
```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8080

CMD ["streamlit", "run", "app.py", \
     "--server.port=8080", \
     "--server.address=0.0.0.0"]
```

### デプロイコマンド
```bash
# イメージをビルド
gcloud builds submit --tag gcr.io/PROJECT_ID/agemas-app

# シークレットマネージャーに登録
gcloud secrets create gcp-service-account-key \
  --data-file=./service-account-key.json

# Cloud Run にデプロイ
gcloud run deploy agemas-app \
  --image gcr.io/PROJECT_ID/agemas-app \
  --platform managed \
  --region asia-northeast1 \
  --set-env-vars \
    GCP_PROJECT_ID=PROJECT_ID,\
    GCS_BUCKET_NAME=agemas-images,\
    MASTER_USERS_SHEET_ID=...,\
    POSTS_SHEET_ID=...,\
    POSTS_REPLIES_SHEET_ID=...,\
    LOGS_SHEET_ID=... \
  --update-secrets GOOGLE_APPLICATION_CREDENTIALS=/secrets/gcp-key/service-account-key.json:latest \
  --memory 512Mi \
  --cpu 1 \
  --allow-unauthenticated
```

---

## まとめ

このコード例を使用することで、あげますサイトは以下が実現できます：

✅ GCS 画像アップロード（署名付き URL）
✅ Google Sheets 読み書き（gspread）
✅ ユーザー認証（bcrypt）
✅ ログ記録（自動記録）
✅ エラーハンドリング（詳細なエラーメッセージ）
✅ ローカル/Cloud Run 両対応

開発中は `.env` + ローカルキー、本番は Cloud Run シークレットマネージャーで安全に管理できます。
