#!/bin/bash

# あげますサイト - GCP サービスアカウント&権限 ワンステップセットアップ
# 使用方法: bash setup_gcp_permissions.sh <PROJECT_ID>

set -e  # エラーで停止

# ============================================================================
# 色付き出力
# ============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'  # No Color

print_section() {
    echo -e "${BLUE}=== $1 ===${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# ============================================================================
# 引数チェック
# ============================================================================

if [ -z "$1" ]; then
    print_error "PROJECT_ID を指定してください"
    echo "使用方法: $0 <PROJECT_ID>"
    echo "例: $0 my-project-123"
    exit 1
fi

PROJECT_ID=$1
SERVICE_ACCOUNT_NAME="sa-agemas-app"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
CUSTOM_ROLE_NAME="agemas-custom-role"
GCS_BUCKET_NAME="agemas-images"

print_section "GCP セットアップ開始"
echo "Project ID: $PROJECT_ID"
echo "Service Account: $SERVICE_ACCOUNT_EMAIL"

# ============================================================================
# 1. gcloud コマンドをセット
# ============================================================================

print_section "gcloud プロジェクトをセット"

gcloud config set project $PROJECT_ID
if [ $? -eq 0 ]; then
    print_success "プロジェクト設定完了: $PROJECT_ID"
else
    print_error "プロジェクト設定に失敗"
    exit 1
fi

# ============================================================================
# 2. 必要な Google Cloud API を有効化
# ============================================================================

print_section "Google Cloud API を有効化"

apis=(
    "storage-api.googleapis.com"
    "sheets.googleapis.com"
    "drive.googleapis.com"
    "servicemanagement.googleapis.com"
    "iam.googleapis.com"
    "run.googleapis.com"
)

for api in "${apis[@]}"; do
    echo "有効化中: $api"
    gcloud services enable $api --quiet
done

print_success "API 有効化完了"

# ============================================================================
# 3. サービスアカウントの作成
# ============================================================================

print_section "サービスアカウントを作成"

# 既存チェック
if gcloud iam service-accounts describe $SERVICE_ACCOUNT_EMAIL &> /dev/null; then
    print_warning "サービスアカウント既存: $SERVICE_ACCOUNT_EMAIL"
else
    gcloud iam service-accounts create $SERVICE_ACCOUNT_NAME \
        --display-name "あげますサイト用 Streamlit アプリ" \
        --quiet
    print_success "サービスアカウント作成完了: $SERVICE_ACCOUNT_EMAIL"
fi

# ============================================================================
# 4. GCS バケットの作成
# ============================================================================

print_section "GCS バケットを作成"

BUCKET_PATH="gs://${GCS_BUCKET_NAME}"

if gsutil ls $BUCKET_PATH &> /dev/null; then
    print_warning "バケット既存: $BUCKET_PATH"
else
    gsutil mb -p $PROJECT_ID -l asia-northeast1 $BUCKET_PATH
    print_success "バケット作成完了: $BUCKET_PATH"
fi

# ============================================================================
# 5. GCS バケットにアクセス権限を設定
# ============================================================================

print_section "GCS バケット権限を設定"

# サービスアカウントに storage.objectCreator を付与
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
    --role="roles/storage.objectCreator" \
    --condition=None \
    --quiet

# サービスアカウントに storage.objectViewer を付与
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
    --role="roles/storage.objectViewer" \
    --condition=None \
    --quiet

print_success "GCS 権限設定完了"

# ============================================================================
# 6. カスタムロール（IAM）の作成
# ============================================================================

print_section "カスタムロール（IAM）を作成"

# 権限定義ファイルを作成
cat > /tmp/agemas_role_config.yaml <<'EOF'
title: "あげますサイト用カスタムロール"
description: "あげますサイト Streamlit アプリ用の最小権限ロール"
includedPermissions:
  - storage.buckets.get
  - storage.objects.get
  - storage.objects.create
  - storage.objects.list
  - storage.objects.delete
EOF

# 既存チェック
if gcloud iam roles describe projects/$PROJECT_ID/roles/$CUSTOM_ROLE_NAME &> /dev/null; then
    print_warning "カスタムロール既存: $CUSTOM_ROLE_NAME"
    # 更新
    gcloud iam roles update projects/$PROJECT_ID/roles/$CUSTOM_ROLE_NAME \
        --file=/tmp/agemas_role_config.yaml \
        --quiet
else
    # 作成
    gcloud iam roles create $CUSTOM_ROLE_NAME \
        --project=$PROJECT_ID \
        --file=/tmp/agemas_role_config.yaml \
        --quiet
    print_success "カスタムロール作成完了: $CUSTOM_ROLE_NAME"
fi

# ============================================================================
# 7. サービスアカウントに IAM ロールを割り当て
# ============================================================================

print_section "サービスアカウントに IAM ロールを割り当て"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
    --role="projects/${PROJECT_ID}/roles/${CUSTOM_ROLE_NAME}" \
    --condition=None \
    --quiet

print_success "IAM ロール割り当て完了"

# ============================================================================
# 8. サービスアカウントキーの作成
# ============================================================================

print_section "サービスアカウントキーを生成"

KEY_FILE="service-account-key.json"

if [ -f "$KEY_FILE" ]; then
    print_warning "キーファイル既存: $KEY_FILE"
    read -p "上書きしますか？ (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_warning "キー生成をスキップ"
    else
        rm $KEY_FILE
        gcloud iam service-accounts keys create $KEY_FILE \
            --iam-account=$SERVICE_ACCOUNT_EMAIL
        print_success "キーファイル作成完了: $KEY_FILE"
    fi
else
    gcloud iam service-accounts keys create $KEY_FILE \
        --iam-account=$SERVICE_ACCOUNT_EMAIL
    print_success "キーファイル作成完了: $KEY_FILE"
fi

# ============================================================================
# 9. .env ファイルテンプレートを作成
# ============================================================================

print_section ".env ファイルテンプレートを作成"

cat > .env.example <<EOF
# GCP 設定
GCP_PROJECT_ID=$PROJECT_ID
GCS_BUCKET_NAME=$GCS_BUCKET_NAME
GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json

# Google Sheets ID（各スプレッドシートのキーを入力）
MASTER_USERS_SHEET_ID=1DcpgR2Ksscj1X_EOPBFbRbiqozT84lMaGV9UMO16kek
POSTS_SHEET_ID=1T-K9XiEkz3lRjXkiQqLlRRqziA9Bj6a142WU0nf8eX0
POSTS_REPLIES_SHEET_ID=1I6vnan3Io8KA9MAKLCemW20KEnHqaQhCIUDlZj5sbM0
LOGS_SHEET_ID=11h3sfe3hkqRf_RlqDvSTPHQRWPLKr0PetmszL2SgYLs
EOF

cp .env.example .env
print_success ".env テンプレート作成完了"

# ============================================================================
# 10. .gitignore を更新
# ============================================================================

print_section ".gitignore を更新"

if [ -f ".gitignore" ]; then
    if ! grep -q "service-account-key.json" .gitignore; then
        echo "" >> .gitignore
        echo "# GCP サービスアカウントキー" >> .gitignore
        echo "service-account-key.json" >> .gitignore
        echo ".env" >> .gitignore
        echo "*.json" >> .gitignore
        print_success ".gitignore を更新"
    else
        print_warning ".gitignore は既に設定済み"
    fi
else
    cat > .gitignore <<'EOF'
# GCP サービスアカウントキー
service-account-key.json
.env
*.json

# Python
__pycache__/
*.py[cod]
*$py.class
.venv/
venv/
EOF
    print_success ".gitignore を作成"
fi

# ============================================================================
# 11. Google Sheets への共有設定
# ============================================================================

print_section "Google Sheets 共有設定情報"

echo ""
echo "以下の 4 つのスプレッドシートをサービスアカウントと共有してください："
echo ""
echo "  サービスアカウントメール: $SERVICE_ACCOUNT_EMAIL"
echo ""
echo "  1. master_users: https://docs.google.com/spreadsheets/d/1DcpgR2Ksscj1X_EOPBFbRbiqozT84lMaGV9UMO16kek/"
echo "  2. posts: https://docs.google.com/spreadsheets/d/1T-K9XiEkz3lRjXkiQqLlRRqziA9Bj6a142WU0nf8eX0/"
echo "  3. posts_replies: https://docs.google.com/spreadsheets/d/1I6vnan3Io8KA9MAKLCemW20KEnHqaQhCIUDlZj5sbM0/"
echo "  4. logs: https://docs.google.com/spreadsheets/d/11h3sfe3hkqRf_RlqDvSTPHQRWPLKr0PetmszL2SgYLs/"
echo ""
echo "共有方法："
echo "  1. 各スプレッドシートを開く"
echo "  2. 「共有」ボタンをクリック"
echo "  3. $SERVICE_ACCOUNT_EMAIL を入力"
echo "  4. ロール「編集者」を選択"
echo "  5. 「共有」をクリック"
echo ""

# ============================================================================
# 12. 設定情報の表示
# ============================================================================

print_section "セットアップ情報"

echo "✓ セットアップが完了しました！"
echo ""
echo "プロジェクト設定:"
echo "  Project ID: $PROJECT_ID"
echo "  Service Account: $SERVICE_ACCOUNT_EMAIL"
echo "  Custom Role: $CUSTOM_ROLE_NAME"
echo "  GCS Bucket: $BUCKET_PATH"
echo ""
echo "次のステップ:"
echo "  1. .env ファイルを編集して、Google Sheets ID を入力"
echo "  2. Google Sheets の共有設定を完了"
echo "  3. Streamlit アプリをテスト: streamlit run app.py"
echo ""
echo "Cloud Run へのデプロイ:"
echo "  gcloud secrets create gcp-service-account-key --data-file=service-account-key.json"
echo "  gcloud run deploy agemas-app --image gcr.io/$PROJECT_ID/agemas-app ..."
echo ""

# ============================================================================
# クリーンアップ
# ============================================================================

rm -f /tmp/agemas_role_config.yaml

print_success "セットアップ完了！"
