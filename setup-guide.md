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

| 項目                 | 選択                                       |
| -------------------- | ------------------------------------------ |
| Template             | minimal                                    |
| Type checking        | TypeScript                                 |
| Add-ons              | prettier, tailwindcss（typography, forms） |
| Install dependencies | Yes（npm）                                 |

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
>
> ```
> legacy-peer-deps=true
> ```
>
> surrealdb 側が peer dependency を更新した場合は不要になる可能性がある。

### 1-4. svelte.config.js を更新

`adapter-auto` から `adapter-cloudflare` に変更し、SPA modeを有効にする。

```js
import adapter from "@sveltejs/adapter-cloudflare";

const config = {
  kit: {
    adapter: adapter({
      fallback: "index.html",
    }),
  },
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
import { Surreal } from "surrealdb";

export const db = new Surreal();

export async function connectDB() {
  const url = import.meta.env.PUBLIC_SURREALDB_URL ?? "ws://localhost:8000";
  await db.connect(url, {
    namespace: "<namespace>", // 例: agemas
    database: "main",
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

| 項目          | 推奨設定                                                    |
| ------------- | ----------------------------------------------------------- |
| Name          | 任意（後から変更不可）                                      |
| Region        | AWS AP South (Mumbai)（日本から最も近いアジア系リージョン） |
| Version       | 最新版（SurrealDB 3.x）                                     |
| Instance data | **Empty**（Demo datasetは選ばない）                         |
| Migration     | チェック不要（新規構築のため）                              |

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

### 3-1. Cloudflare にログイン

```bash
npx wrangler login
```

ブラウザが開くので Cloudflare アカウントで認証する。

### 3-2. R2 バケット作成

```bash
npx wrangler r2 bucket create <bucket-name>
```

例: `npx wrangler r2 bucket create agemas-images`

成功すると `✅ Created bucket '<bucket-name>'` と表示される。

### 3-3. wrangler.toml を作成

プロジェクトルートに `wrangler.toml` を作成する。

```toml
name = "<project-name>"
compatibility_date = "2024-01-01"

[[r2_buckets]]
binding = "IMAGES"
bucket_name = "<bucket-name>"
```

### 3-4. TypeScript 型定義を更新

`src/app.d.ts` の `Platform` インターフェースに R2Bucket を追加する。

```ts
interface Platform {
  env: {
    IMAGES: R2Bucket;
  };
}
```

### 3-5. APIルートを作成

- `src/routes/api/upload/+server.ts` — 画像アップロード（POST）
- `src/routes/api/images/[key]/+server.ts` — 画像取得（GET）・削除（DELETE）

アップロードAPIの主なバリデーション：

- 許可形式: `image/jpeg`, `image/png`, `image/webp`, `image/gif`
- 最大サイズ: 5MB
- キー: `${Date.now()}-${crypto.randomUUID()}.${ext}`（重複防止）

画像取得APIは `Cache-Control: public, max-age=31536000`（1年）を返す。

---

## Step 4: 認証機能実装

### 4-1. 認証の設計方針

- **認証ロジック（パスワード検証）は SurrealDB Cloud が行う**
- ブラウザ側は `db.signin()` で JWT を取得・保持するだけ
- SvelteKit はその JWT を使ってページガード・UI表示を行う

### 4-2. auth.svelte.ts（認証状態管理）

`src/lib/auth.svelte.ts` を作成する。`.svelte.ts` 拡張子にすることで `$state` が使用可能。

主な関数：

- `initAuth()` — アプリ起動時に既存セッションを復元（`SELECT * FROM $auth` で確認）
- `login(userId, password)` — `db.signin()` を呼び JWT 取得 → ユーザー情報をstateに保存
- `logout()` — `db.invalidate()` でトークン破棄

> **注意:** surrealdb v2 には `db.info()` がない。`SELECT * FROM $auth` でログインユーザーを取得する。

> **注意:** `db.signin()` の引数は `access:` （v1の`scope:`ではない）、変数は `variables: {}` でネストする。

> **注意:** `SELECT * FROM $auth` で返る `id` は runtime 上 `RecordId` オブジェクトになることがある。
> state に入れる前に `String(user.id)` で文字列化しておくと、`item.owner` などとの比較が安定する。

```ts
async function fetchAuthUser(): Promise<AuthUser | null> {
  const result = await db.query<[AuthUser[]]>("SELECT * FROM $auth");
  const user = result[0]?.[0];

  if (!user) return null;

  return {
    ...user,
    id: String(user.id),
  };
}
```

### 4-3. rateLimit.ts（ブルートフォース対策）

`src/lib/rateLimit.ts` を作成する。localStorage でログイン失敗回数を管理。

- 5回失敗で15分ロック
- `checkRateLimit(userId)` — ロック中か確認
- `recordFailure(userId)` — 失敗を記録
- `recordSuccess(userId)` — 成功時にリセット

### 4-4. ログインページ（/login）

`src/routes/login/+page.svelte` を作成する。

- user_id（**3桁文字列**。例: `"001"`）+ PIN（4桁、`inputmode="numeric"`）の入力フォーム
- ログイン済みなら `$effect` でトップへリダイレクト
- エラー時はメッセージを表示

### 4-5. ログイン不能時の確認ログ（2026-04-16）

事象:

- ログイン画面からサインインできない
- SurrealDB Cloud 上には `user` レコードが存在するのに、画面ではログインに進めない

原因:

- フロントエンドは `user_id` を **3桁数字文字列**（例: `"001"`）として扱っている
- 一方、DB には `user_id: "testuser01"` のような旧データが残っていた
- この値はログイン画面の `^\d{3}$` バリデーションに合致しないため、DB の認証処理まで到達しなかった

確認に使った SurrealQL:

```sql
USE NAMESPACE agemas;
USE DATABASE main;

SELECT id, user_id, last_name, first_name, role
FROM user
ORDER BY user_id ASC;
```

対処:

- 管理者ユーザーの `user_id` を `"001"` に統一
- 必要に応じて PIN も再設定

```sql
UPDATE user:l8kqnlmqgy20ka8b8a9d SET
  user_id = "001",
  password = crypto::argon2::generate("1234");
```

再発防止:

- `user_id` は **必ず3桁文字列**（`"001"` 形式）で登録する
- `testuser01` や `1` のような旧形式は使わない
- 作成済みデータに旧形式が混ざっていないか、初期セットアップ後に `SELECT id, user_id FROM user;` で確認する

### 4-6. +layout.svelte にページガードを追加

`onMount` で `initAuth()` を呼び出し、`$effect` で未ログイン時に `/login` にリダイレクト。セッション復元中はローディング表示。

---

## Step 5: 出品一覧画面実装

### 5-1. 型定義（src/lib/types.ts）

`Item`・`Want` の TypeScript 型を定義する。

### 5-2. トップページ（src/routes/+page.svelte）

- `onMount` で初期データを取得（`db.query()` で `status != 'transferred'` の件のみ）
- 出品者名は `owner.last_name + owner.first_name AS owner_name` でJOIN取得
- Live Query でリアルタイム更新

**Live Query の注意点:**

```ts
import { Table } from "surrealdb";

// LiveResource には Table クラスが必要（文字列 'item' では型エラー）
const sub = await db.live<Item>(new Table("item"));
```

**onMount のクリーンアップ:**

```ts
// async onMount 内で return () => cleanup() は型エラーになる
// onDestroy を別途使う
let killLive: (() => Promise<void>) | undefined;

onMount(async () => {
  const sub = await db.live<Item>(new Table("item"));
  killLive = () => sub.kill();
  // ...
});

onDestroy(() => {
  killLive?.();
});
```

**初期ロード失敗時のハンドリング:**

- `item` / `want` テーブルが未作成だと初期クエリが失敗する
- `onMount` 内の初期取得は `try/catch/finally` で囲み、失敗時も `loading = false` を必ず実行する
- 失敗時は「読み込み中...」のままにせず、画面にエラーメッセージを表示する

**Live Query のメッセージ処理:**

- `action === 'CREATE'` → リストに追加
- `action === 'UPDATE'` → `transferred` になったら除外、それ以外は更新
- `action === 'DELETE'` → リストから削除（`String(msg.recordId)` で比較）

**RecordId 比較の注意点:**

- SurrealDB SDK の `id` / `owner` / `requester` は `RecordId` オブジェクトで返ることがある
- UI 条件分岐では **両辺を `String(...)` で正規化** してから比較する
- 片側だけ文字列化すると、出品者なのに `編集` や `交渉決裂` / `譲渡成立` が表示されない不具合になる

```ts
function recordId(value: unknown) {
  return String(value);
}

function currentUserId() {
  return auth.user ? recordId(auth.user.id) : null;
}

function isOwnedByCurrentUser(item: Item) {
  return recordId(item.owner) === currentUserId();
}
```

---

## Step 6: 出品作成・編集・削除機能実装

### 6-1. 出品作成（/items/new）

`src/routes/items/new/+page.svelte` を作成する。

- 画像は `/api/upload` に POST → R2キーを取得
- SurrealDB への登録は `db.query('INSERT INTO item { owner: $auth.id, ... }')`
- `owner` は `$auth.id`（サーバー側で設定されるため安全）

### 6-2. 出品編集・削除（/items/[id]/edit）

`src/routes/items/[id]/edit/+page.svelte` を作成する。

- レコード取得: `SELECT * FROM type::thing("item", $id)` でIDを安全にバインド
- 更新: `UPDATE type::thing("item", $id) SET ...`
- 削除: `DELETE type::thing("item", $id)`
- 既存画像はキーのリストで管理し、×ボタンで除外 → 新規画像と結合して保存

**出品一覧での編集リンク:**

```svelte
{#if String(item.owner) === String(auth.user?.id)}
  <a href={`/items/${String(item.id).split(':')[1]}/edit`}>編集</a>
{/if}
```

SurrealDB のレコードIDは `item:abc123` 形式なので `split(':')[1]` でID部分を取得。

**アクセス制御:** SurrealDB のパーミッション（`owner = $auth.id`）でサーバー側でも保証される。

---

## Step 7: ほしいボタン & ステータス管理実装

### 7-1. 型定義を更新（src/lib/types.ts）

`Item` に `requester_name?: string`、`Want` に `requester_name?: string` を追加する。

```ts
export type Item = {
  // ...（既存フィールド）
  owner_name?: string;
  requester_name?: string; // negotiating状態のとき希望者の名前
};

export type Want = {
  id: string;
  item: string;
  requester: string;
  created_at: string;
  requester_name?: string;
};
```

### 7-2. トップページに機能追加（src/routes/+page.svelte）

#### 初期データ取得

アイテム一覧と want 一覧を並行取得し、アイテムに希望者名を付加する。

```ts
const [itemResult, wantResult] = await Promise.all([
  db.query<[Item[]]>(
    `SELECT *, owner.last_name + owner.first_name AS owner_name FROM item WHERE status != 'transferred' ORDER BY created_at DESC`,
  ),
  db.query<[Want[]]>("SELECT * FROM want"),
]);

const allWants = wantResult[0] ?? [];
const wantByItemId = new Map(allWants.map((w) => [String(w.item), w]));

items = (itemResult[0] ?? []).map((item) => ({
  ...item,
  requester_name: wantByItemId.get(String(item.id))?.requester_name,
}));

// 自分がほしいボタンを押したアイテムIDセット（ほしいボタン非表示判定用）
myWantIds = new Set(
  allWants
    .filter((w) => String(w.requester) === String(auth.user?.id))
    .map((w) => String(w.item)),
);
```

> **注意:** `want` テーブルのパーミッションは `requester = $auth.id OR item.owner = $auth.id` のため、
> 一般ユーザーは「自分がほしいを押したwant」と「自分の出品に対するwant」のみ取得できる。
> `SELECT * FROM want` だけで自分に関係するwantのみ返ってくる。

#### Live Query UPDATE ハンドラー修正

UPDATE 時は JOINフィールド（`owner_name`, `requester_name`）が含まれないため、補完処理を追加する。

```ts
} else if (msg.action === 'UPDATE') {
  const updated = msg.value as Item;
  if (updated.status === 'transferred') {
    items = items.filter((i) => i.id !== updated.id);
  } else {
    // available に戻ったら myWantIds から除外
    if (updated.status === 'available') {
      const newSet = new Set(myWantIds);
      newSet.delete(String(updated.id));
      myWantIds = newSet;
    }
    // want テーブルから希望者名を別途取得して付加
    const enriched = await enrichItemWithRequester(updated);
    items = items.map((i) => (i.id === updated.id ? enriched : i));
  }
}
```

```ts
// 希望者名を補完するヘルパー
async function enrichItemWithRequester(item: Item): Promise<Item> {
  const idPart = String(item.id).split(":")[1];
  const r = await db.query<[Want[]]>(
    'SELECT requester.last_name + requester.first_name AS requester_name FROM want WHERE item = type::thing("item", $id)',
    { id: idPart },
  );
  return { ...item, requester_name: r[0]?.[0]?.requester_name };
}
```

#### アクション関数

```ts
// ほしいボタン: wantレコード作成（item.status 更新はDBイベントに委譲）
async function handleWant(itemId: string) {
  await db.query(
    "INSERT INTO want { item: type::record($itemId), requester: $auth.id }",
    { itemId },
  );
}

// 譲渡成立: status を transferred に更新（Live Queryが一覧から除外する）
async function handleTransferred(itemId: string) {
  await db.query(
    "UPDATE type::record($itemId) SET status='transferred', updated_at=time::now()",
    { itemId },
  );
}

// 交渉決裂: wantレコード削除（item.status 更新はDBイベントに委譲）
async function handleNegotiationFailed(itemId: string) {
  await db.query("DELETE want WHERE item = type::record($itemId)", { itemId });
}
```

#### UNIQUE INDEX 違反時の表示

二重申請は `want_item_requester` の UNIQUE INDEX で止め、フロントでは
`already contains` を含むエラーを検知して `すでに申請中です` を表示する。

```ts
function isDuplicateWantError(err: unknown) {
  return (
    err instanceof Error &&
    err.message.includes("want_item_requester") &&
    err.message.includes("already contains")
  );
}
```

#### UI: ほしいボタン / ステータス操作

各アイテムカードの下部に条件分岐でボタンを表示する。

```svelte
<div class="mt-3 flex items-center justify-end gap-2">
  {#if String(item.owner) !== String(auth.user?.id) && myWantIds.has(String(item.id))}
    <span class="rounded bg-yellow-100 px-4 py-1.5 text-sm font-medium text-yellow-700">
      申請中
    </span>

  {:else if item.status === 'available' && String(item.owner) !== String(auth.user?.id)}
    <!-- ほしいボタン（自分が出品していないavailable品） -->
    <button onclick={() => handleWant(String(item.id))}>ほしい</button>

  {:else if item.status === 'negotiating' && String(item.owner) === String(auth.user?.id)}
    <!-- 出品者向け: 希望者名 + 交渉決裂 / 譲渡成立 -->
    {#if item.requester_name}
      <span>希望者: {item.requester_name}</span>
    {/if}
    <button onclick={() => handleNegotiationFailed(String(item.id))}>交渉決裂</button>
    <button onclick={() => handleTransferred(String(item.id))}>譲渡成立</button>
  {/if}
</div>
```

### ステータス遷移まとめ

| 操作             | 前            | 後            | 誰が操作 |
| ---------------- | ------------- | ------------- | -------- |
| ほしいボタン押下 | `available`   | `negotiating` | 非出品者 |
| 譲渡成立ボタン   | `negotiating` | `transferred` | 出品者   |
| 交渉決裂ボタン   | `negotiating` | `available`   | 出品者   |

- `transferred` になったアイテムは一覧から非表示（SurrealDB のパーミッションでも `status != 'transferred'` でブロック）
- `交渉決裂` 時は `DELETE want WHERE item = ...` で want レコードも削除する

---

### Step 7-X: イベント駆動への移行

`want` 作成者しか `want` を消せず、出品者しか `item` を更新できない、という権限境界のままだと
フロントから `want` と `item` を両方更新する実装が破綻しやすい。
このため、状態遷移は SurrealDB Event に寄せ、フロントは「主操作」だけを送る構成に変更した。

#### SurrealDB Cloud で実行した移行SQL

SurrealDB Cloud の **Run queries** で、`namespace = agemas`、`database = main` を確認してから以下を実行する。

```sql
-- 1. want.delete 権限に「item の出品者」を追加（交渉決裂で出品者がwantを消せるように）
DEFINE TABLE OVERWRITE want SCHEMAFULL
  PERMISSIONS
    FOR select WHERE requester = $auth.id OR item.owner = $auth.id OR $auth.role = 'admin'
    FOR create WHERE $auth.id != NONE
    FOR delete WHERE requester = $auth.id OR item.owner = $auth.id OR $auth.role = 'admin';

-- 2. want のフィールドを再定義（OVERWRITE TABLE がフィールドを巻き添えにする可能性に備え）
DEFINE FIELD OVERWRITE item       ON want TYPE record<item>;
DEFINE FIELD OVERWRITE requester  ON want TYPE record<user>;
DEFINE FIELD OVERWRITE created_at ON want TYPE datetime DEFAULT time::now();

-- 3. 二重「ほしい」防止: 同一 (item, requester) 組み合わせの UNIQUE INDEX
DEFINE INDEX OVERWRITE want_item_requester ON want FIELDS item, requester UNIQUE;

-- 4. イベント: want INSERT → item.status を 'negotiating' に
DEFINE EVENT OVERWRITE on_want_create ON want WHEN $event = 'CREATE' THEN {
  UPDATE $after.item SET status = 'negotiating', updated_at = time::now();
};

-- 5. イベント: want DELETE → 残want数で分岐（先着1名前提なら 'available' に戻す）
DEFINE EVENT OVERWRITE on_want_delete ON want WHEN $event = 'DELETE' THEN {
  LET $item_id = $before.item;
  IF (SELECT count() FROM want WHERE item = $item_id GROUP ALL)[0].count == NONE
     OR (SELECT count() FROM want WHERE item = $item_id GROUP ALL)[0].count == 0 {
    UPDATE $item_id SET status = 'available', updated_at = time::now()
      WHERE status != 'transferred';
  };
};

-- 6. イベント: item が 'transferred' になったら関連 want を全削除（ゴミ掃除）
DEFINE EVENT OVERWRITE on_item_transferred ON item
  WHEN $event = 'UPDATE' AND $before.status != 'transferred' AND $after.status = 'transferred'
  THEN {
    DELETE want WHERE item = $after.id;
  };
```

実行結果は各 statement とも `NONE` だった。

```text
-------- Query 1 --------
NONE
-------- Query 2 --------
NONE
-------- Query 3 --------
NONE
-------- Query 4 --------
NONE
-------- Query 5 --------
NONE
-------- Query 6 --------
NONE
-------- Query 7 --------
NONE
-------- Query 8 --------
NONE
```

#### 反映確認

以下を実行し、index と event が反映されていることを確認する。

```sql
INFO FOR DB;
INFO FOR TABLE want;
INFO FOR TABLE item;
```

確認ポイント:

- `INFO FOR TABLE want` に `want_item_requester` index がある
- `INFO FOR TABLE want` に `on_want_create`, `on_want_delete` がある
- `INFO FOR TABLE item` に `on_item_transferred` がある

#### 実装上の注意

- フロントは `want` の INSERT / DELETE と `item.status = 'transferred'` の UPDATE だけ送る
- `UPDATE $item_id SET ...` のように文字列変数を直接 UPDATE 対象にはできないため、`type::record($itemId)` を使う
- UNIQUE INDEX 違反時の実エラーは `Database index \`want_item_requester\` already contains ...` 形式だった

---

---

## Step 8: 管理者画面実装

### 8-1. SurrealDB スキーマ更新

`user` テーブルに `FOR create` 権限を追加する必要がある。  
SurrealDB Cloud の「Run queries」で以下を実行する。

```sql
USE NAMESPACE agemas;
USE DATABASE main;

DEFINE TABLE user SCHEMAFULL
  PERMISSIONS
    FOR select WHERE id = $auth.id OR $auth.role = 'admin' OR $auth = NONE
    FOR create WHERE $auth.role = 'admin'
    FOR update WHERE id = $auth.id OR $auth.role = 'admin'
    FOR delete WHERE $auth.role = 'admin';
```

> **注意:** `DEFINE TABLE ... PERMISSIONS` は上書き定義なので、全権限を再度列挙する。  
> `FOR create` を追加した場合、既存の `FOR select`・`FOR update`・`FOR delete` も含めて書くこと。

### 8-2. 管理者ユーザー作成（初回のみ）

アプリからはまだ管理者ユーザーを作れないため、初回は SurrealDB Cloud の「Run queries」で直接作成する。

```sql
INSERT INTO user {
  user_id: "001",
  last_name: "（姓）",
  first_name: "（名）",
  password: crypto::argon2::generate("1234"),
  role: "admin"
};
```

> **注意:** `crypto::argon2::generate()` はSurrealDB組み込み関数。平文PINをargon2ハッシュに変換して保存する。

### 8-3. 管理者ページ実装

`src/routes/admin/+page.svelte` を作成する。

主な機能：

- **ユーザー一覧**: user_id・姓名・ロール表示
- **ユーザー編集（インライン）**: 姓・名・PIN（空白なら変更なし）・ロール変更
- **ユーザー削除**: 自分自身は削除不可（`user.id !== auth.user?.id` でガード）
- **ユーザー作成フォーム**: user_id（3桁文字列）・姓・名・PIN・ロール

**管理者ガード（onMount）**:

```ts
onMount(async () => {
  if (!auth.loading && auth.user?.role !== "admin") {
    goto("/");
    return;
  }
  await loadUsers();
});
```

**ユーザー作成クエリ（パスワードのargon2ハッシュ化はSurrealDB側で行う）**:

```ts
await db.query(
  `INSERT INTO user {
    user_id: $user_id,
    last_name: $last_name,
    first_name: $first_name,
    password: crypto::argon2::generate($password),
    role: $role
  }`,
  { user_id: newUserId, last_name, first_name, password, role },
);
```

> **注意:** `user_id` は DB 設計・ログイン画面ともに **3桁文字列** 前提。`1` や `testuser01` のような別形式を混在させるとログイン不能の原因になる。

**パスワードリセットクエリ**:

```ts
await db.query(
  `UPDATE type::thing("user", $id) SET
    last_name=$last_name, first_name=$first_name,
    password=crypto::argon2::generate($password), role=$role`,
  { id: idPart, last_name, first_name, password, role },
);
```

### 8-4. トップページに管理リンクを追加

`src/routes/+page.svelte` のヘッダーに管理者のみ表示するリンクを追加する。

```svelte
{#if auth.user?.role === 'admin'}
  <a href="/admin" class="text-sm text-gray-400 hover:text-gray-600">管理</a>
{/if}
```

---

---

## Step 9: Cloudflare Pages デプロイ

（実施後に追記）
