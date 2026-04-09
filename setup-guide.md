# セットアップ手順書

別の団体向けに同じアプリを構築する際の手順書。

---

## 前提条件

以下のアカウント・ツールを事前に用意する。

- [GitHub](https://github.com) アカウント
- [SurrealDB Cloud](https://surrealdb.com/cloud) アカウント
- [Cloudflare](https://cloudflare.com) アカウント（R2 + Pages 利用）
- Node.js（v20以上推奨）
- npm

---

## Step 1: SvelteKitプロジェクト初期化

### 1-1. リポジトリ作成

GitHubで新しいリポジトリを作成し、ローカルにクローンする。

```bash
git clone https://github.com/<your-org>/<your-repo>.git
cd <your-repo>
```

### 1-2. SvelteKitプロジェクト生成

```bash
npx sv create .
```

対話式プロンプトでの推奨設定：

| 項目 | 選択 |
|------|------|
| Template | minimal |
| Type checking | TypeScript |
| Add-ons | prettier, tailwindcss（typography, forms） |
| Install dependencies | Yes（npm） |

> **注意:** `sv` CLIのバージョンによって選択肢が変わる場合があるため、実行前に [公式ドキュメント](https://svelte.dev/docs/kit/creating-a-project) を確認すること。

### 1-3. adapter-cloudflare・surrealdb・wrangler のインストール

```bash
npm install --save-dev @sveltejs/adapter-cloudflare wrangler
npm install surrealdb --legacy-peer-deps
npm uninstall @sveltejs/adapter-auto
```

> **注意:** **SvelteKit が TypeScript 6.x を使用している場合、この設定は必須。**
> `surrealdb@2.x` の peer dependency が `typescript@"^5.0.0"`（5.x のみ）のため、TypeScript 6.x と競合する。
> `.npmrc` をプロジェクトルートに作成して回避する。
> ```
> legacy-peer-deps=true
> ```
> surrealdb 側が peer dependency を更新した場合は不要になる可能性がある。

### 1-4. svelte.config.js を更新

`adapter-auto` から `adapter-cloudflare` に変更し、SPA modeを有効にする。

```js
import adapter from '@sveltejs/adapter-cloudflare';

const config = {
  kit: {
    adapter: adapter({
      fallback: 'index.html'
    })
  }
};

export default config;
```

### 1-5. SPA mode 設定

`src/routes/+layout.ts` を作成する。

```ts
export const ssr = false;
```

### 1-6. SurrealDB 接続ユーティリティ

`src/lib/db.ts` を作成する。

```ts
import { Surreal } from 'surrealdb';

export const db = new Surreal();

export async function connectDB() {
  const url = import.meta.env.PUBLIC_SURREALDB_URL ?? 'ws://localhost:8000';
  await db.connect(url, {
    namespace: '<namespace>',  // 例: agemas
    database: 'main'
  });
}
```

> **注意:** `import { Surreal }` は named export（`import Surreal from` ではない）。surrealdb v2以降の書き方。

### 1-7. .gitignore を確認・更新

以下が含まれていることを確認する。

```
.env
.env.local
.env.*.local
node_modules/
.svelte-kit/
build/
.DS_Store
```

### 1-8. 動作確認

```bash
npm run check  # 0 ERRORS であること
```

---

## Step 2: SurrealDB Cloud セットアップ & スキーマ定義

### 2-1. インスタンス作成

1. [SurrealDB Cloud](https://surrealdb.com/cloud) にログイン
2. 「New instance」からインスタンスを作成

| 項目 | 推奨設定 |
|------|----------|
| Name | 任意（後から変更不可） |
| Region | AWS AP South (Mumbai)（日本から最も近いアジア系リージョン） |
| Version | 最新版（SurrealDB 3.x） |
| Instance data | **Empty**（Demo datasetは選ばない） |
| Migration | チェック不要（新規構築のため） |

### 2-2. Namespace / Database 作成

インスタンス作成後、「Run queries」を開き以下を実行する。

```sql
DEFINE NAMESPACE <namespace>;
USE NAMESPACE <namespace>;
DEFINE DATABASE main;
```

### 2-3. スキーマ定義（DDL実行）

`db-design.md` の DDL（`USE NAMESPACE` 2行を除く）をすべて貼り付けて実行する。

実行後、以下で確認する。

```sql
INFO FOR DB;
```

`tables` に `user`、`item`、`want`、`accesses` に `user` が表示されれば成功。

> **補足:** `DEFINE` 系DDLは正常実行されると `NONE` を返す。エラーメッセージがなければ成功。

### 2-4. 接続URL の確認

インスタンス画面の接続情報から `wss://` 形式のURLを取得し、`.env` に設定する。

```
PUBLIC_SURREALDB_URL=wss://your-instance.aws-aps1.surreal.cloud
```

---

## Step 3: Cloudflare R2 バケット設定

（実施後に追記）

---

## Step 4: 認証機能実装

（実施後に追記）

---

## Step 5: 出品一覧画面実装

（実施後に追記）

---

## Step 6: 出品作成・編集・削除機能実装

（実施後に追記）

---

## Step 7: ほしいボタン & ステータス管理実装

（実施後に追記）

---

## Step 8: 管理者画面実装

（実施後に追記）

---

## Step 9: Cloudflare Pages デプロイ

（実施後に追記）
