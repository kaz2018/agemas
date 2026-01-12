# あげますサイト - GCP サービスアカウント権限設定ガイド

## 概要
Streamlit（Cloud Run）から、Google Sheets と Google Cloud Storage にアクセスするため、サービスアカウントが必要です。このガイドでは、必要最小限の権限（最小権限の原則）に基づいて設定します。

---

## 1. サービスアカウント作成手順

### 1.1 GCP コンソールでのサービスアカウント作成

```bash
# 1. GCP プロジェクトを選択
# コンソール: https://console.cloud.google.com/

# 2. ナビゲーション > IAM と管理 > サービスアカウント

# 3. 「サービスアカウントを作成」をクリック
```

**入力内容**:
- **サービスアカウント名**: `sa-agemas-app`
- **説明**: `おさがり共有サイト用 Streamlit アプリ`
- **プロジェクト ID**: 自動付与 (例: `sa-agemas-app@project-id.iam.gserviceaccount.com`)

### 1.2 IAM ロール割り当て（オプション）

この手順は後述の「カスタムロール」作成で対応するため、ここではスキップして OK です。

---

## 2. 必要な IAM ロール（権限）

### 2.1 最小権限アプローチ

以下の 2 つの権限セットが必要です：

| 対象サービス | 必要なロール | 理由 |
|---|---|---|
| **Google Cloud Storage** | `roles/storage.objectViewer` | 画像の読み込み（署名付き URL 生成） |
| **Google Cloud Storage** | `roles/storage.objectCreator` | 画像のアップロード |
| **Google Sheets API** | `roles/editor` (スプレッドシート単位) | Google Sheets への読み書き |

---

## 3. 権限割り当て方法

### 方法 A: カスタムロール作成（推奨）

最小権限を実装するため、カスタムロールを作成します。

#### ステップ 1: IAM と管理 > ロール > 「カスタムロール作成」

```
ロール名: agemas-custom-role
説明: あげますサイト用の最小権限ロール
```

#### ステップ 2: 権限を追加

以下の権限を追加してください：

**Google Cloud Storage 関連**:
```
storage.buckets.get                     # バケット情報の取得
storage.objects.get                     # オブジェクト読み込み
storage.objects.create                  # オブジェクト作成
storage.objects.list                    # オブジェクトリスト表示
```

**Google Sheets API 関連**:
```
script.projects.create                  # Google Apps Script 実行（不要な場合は削除）
```

実は、Google Sheets の読み書きは **gspread** ライブラリを使用し、サービスアカウントのメールアドレスをスプレッドシートの編集者として追加することで実現します。IAM ロールではなく、**スプレッドシート単位での共有**を使用します。

#### ステップ 3: サービスアカウントにロールを割り当て

1. **IAM と管理 > IAM**
2. **「編集」ボタンをクリック**
3. 新規メンバーを追加: `sa-agemas-app@project-id.iam.gserviceaccount.com`
4. 作成したカスタムロール `agemas-custom-role` を割り当て

---

## 4. Google Sheets のアクセス権限設定

### ステップ 1: サービスアカウントメールアドレスを確認

```
sa-agemas-app@project-id.iam.gserviceaccount.com
```

### ステップ 2: 各スプレッドシートを共有

以下の 4 つのスプレッドシートを、サービスアカウントに **編集者** として共有します：

1. `master_users` スプレッドシート
2. `posts` スプレッドシート
3. `posts_replies` スプレッドシート
4. `logs` スプレッドシート

**共有手順**:
1. スプレッドシートを開く
2. 右上の「共有」ボタン
3. サービスアカウントメールを入力
4. ロール: **編集者**
5. 「共有」をクリック

---

## 5. Google Cloud Storage バケットの権限設定

### ステップ 1: GCS バケット作成

```bash
gsutil mb gs://agemas-images
```

### ステップ 2: バケットのアクセス権限設定

**IAM タブ**:
1. **IAM と管理 > バケットを選択**
2. **「権限」タブ**
3. **「メンバーを追加」をクリック**

**メンバー**: `sa-agemas-app@project-id.iam.gserviceaccount.com`
**ロール**: `roles/storage.objectCreator` (オブジェクト作成)

### ステップ 3: 公開アクセスの禁止

**「公開アクセスを禁止」に設定** → セキュリティ強化

署名付き URL でアクセス制御するため、バケット全体を公開にする必要はありません。

---

## 6. サービスアカウント キーの生成

### ステップ 1: キーを生成

```bash
# GCP コンソール
# IAM と管理 > サービスアカウント > sa-agemas-app > キー
# 「キーを追加」 > 新しいキーを作成 > JSON
```

### ステップ 2: JSON ファイルをダウンロード

```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "xxx",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "sa-agemas-app@project-id.iam.gserviceaccount.com",
  "client_id": "123456789",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/sa-agemas-app%40..."
}
```

### ステップ 3: キーを安全に保管

```bash
# プロジェクトのルートに .env ファイルで管理
# .env に以下を追加
export GOOGLE_APPLICATION_CREDENTIALS="path/to/service-account-key.json"

# または、Cloud Run にシークレットとして登録
gcloud secrets create gcp-service-account-key --data-file=service-account-key.json
```

**⚠️ セキュリティ注意**:
- `service-account-key.json` は絶対に Git にコミットしない
- `.gitignore` に追加
- Cloud Run デプロイ時は、シークレットマネージャーまたは環境変数で管理

---

## 7. Cloud Run デプロイ時の環境変数設定

### ステップ 1: シークレットマネージャーに登録

```bash
gcloud secrets create gcp-service-account-key \
  --data-file=/path/to/service-account-key.json
```

### ステップ 2: Cloud Run デプロイ時に環境変数を設定

```bash
gcloud run deploy agemas-app \
  --image gcr.io/project-id/agemas-app \
  --platform managed \
  --region asia-northeast1 \
  --set-env-vars GOOGLE_APPLICATION_CREDENTIALS=/secrets/gcp-key/service-account-key.json \
  --update-secrets GOOGLE_APPLICATION_CREDENTIALS=/secrets/gcp-key/service-account-key.json:latest
```

または、Cloud Run のコンソールで：
1. Cloud Run > サービス > agemas-app > 編集
2. 「シークレット」セクション
3. キーを追加

---

## 8. Streamlit コード内での認証

### Python コード例

```python
from google.oauth2 import service_account
from google.cloud import storage
import gspread

# GCS クライアント
credentials = service_account.Credentials.from_service_account_file(
    '/path/to/service-account-key.json',
    scopes=['https://www.googleapis.com/auth/devstorage.read_write']
)
storage_client = storage.Client(credentials=credentials)
bucket = storage_client.bucket('agemas-images')

# Google Sheets クライアント
gs_credentials = service_account.Credentials.from_service_account_file(
    '/path/to/service-account-key.json',
    scopes=['https://spreadsheets.google.com/feeds', 
            'https://www.googleapis.com/auth/drive']
)
gc = gspread.authorize(gs_credentials)

# スプレッドシート操作
sh = gc.open_by_key('SHEET_ID')
worksheet = sh.worksheet('master_users')
```

---

## 9. 権限チェックリスト

デプロイ前に、以下を確認してください：

- [ ] サービスアカウント作成済み: `sa-agemas-app@project-id.iam.gserviceaccount.com`
- [ ] カスタムロール作成済み: `agemas-custom-role`
- [ ] サービスアカウントにカスタムロール割り当て済み
- [ ] GCS バケット作成済み: `gs://agemas-images`
- [ ] サービスアカウントに GCS 権限割り当て済み
- [ ] 4 つのスプレッドシートをサービスアカウントに共有済み
- [ ] サービスアカウント JSON キー生成済み
- [ ] `.gitignore` に `service-account-key.json` を追加
- [ ] Cloud Run 環境変数に `GOOGLE_APPLICATION_CREDENTIALS` を設定済み

---

## 10. トラブルシューティング

| エラー | 原因 | 対応 |
|---|---|---|
| `403 Forbidden` | 権限不足 | IAM ロール、または Google Sheets 共有権限を確認 |
| `404 Not Found` | リソースが見つからない | バケット名、スプレッドシート ID を確認 |
| `PERMISSION_DENIED` | サービスアカウント未認証 | `GOOGLE_APPLICATION_CREDENTIALS` 環境変数を確認 |
| `Invalid JSON` | キーファイルの形式が不正 | JSON ファイルが正しくダウンロードされているか確認 |

---

## 11. セキュリティベストプラクティス

1. **最小権限の原則**: 必要な権限のみを割り当て
2. **キー管理**: 
   - キーファイルは Git にコミットしない
   - Cloud Run のシークレットマネージャーで管理
   - 定期的にキーをローテーション（年 1 回以上）
3. **監査ログ**:
   - Cloud Audit Logs でアクセス履歴を監視
   - 異常なアクセスを検知
4. **ネットワーク**:
   - Cloud Run を VPC に配置（オプション）
   - GCS アクセスを制限

---

## まとめ

| 対象 | 設定内容 |
|---|---|
| **サービスアカウント** | `sa-agemas-app@project-id.iam.gserviceaccount.com` |
| **IAM ロール** | `agemas-custom-role`（カスタムロール） |
| **GCS 権限** | `roles/storage.objectCreator` |
| **Google Sheets** | スプレッドシート単位で「編集者」として共有 |
| **キー管理** | シークレットマネージャーで管理 |
| **Cloud Run サービス** | `agemas-app` |

この設定により、あげますサイト Streamlit アプリは安全かつ効率的に GCP サービスにアクセスできます。
