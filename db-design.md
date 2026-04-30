# DB設計（SurrealDB）

SurrealDB v3の構文を使用。`DEFINE SCOPE`はv2で削除済みのため`DEFINE ACCESS`を使用する。

## スキーマ定義

```sql
USE NAMESPACE agemas;
USE DATABASE main;

-- user テーブル
-- ※ SELECT は「ログイン済みなら誰でも可」に開放（item.owner / want.requester を
--   名前連結する一覧クエリで他人の user レコードを読む必要があるため）。
--   `OR $auth = NONE` は DEFINE ACCESS の SIGNIN クエリ（未認証コンテキスト）用。
-- ※ 機密フィールド（password）はフィールド単位の PERMISSIONS で本人/admin のみに制限。
--   SurrealDB のフィールド権限はテーブル権限を緩和できないため、
--   「テーブル開放 → 機密フィールドだけ閉じる」の方向で設計する必要がある。
DEFINE TABLE user SCHEMAFULL
  PERMISSIONS
    FOR select WHERE $auth.id != NONE OR $auth = NONE
    FOR create WHERE $auth.role = 'admin'
    FOR update WHERE id = $auth.id OR $auth.role = 'admin'
    FOR delete WHERE $auth.role = 'admin';

DEFINE FIELD user_id    ON user TYPE string;   -- 3桁ゼロ埋め文字列（例: "001"）
DEFINE FIELD last_name  ON user TYPE string;   -- 姓（ひらがな、表示用）
DEFINE FIELD first_name ON user TYPE string;   -- 名（ひらがな、表示用）
DEFINE FIELD password   ON user TYPE string    -- argon2ハッシュ
  PERMISSIONS FOR select WHERE id = $auth.id OR $auth.role = 'admin' OR $auth = NONE;
DEFINE FIELD role       ON user TYPE string DEFAULT 'user'; -- 'user' | 'admin'
DEFINE FIELD created_at ON user TYPE datetime DEFAULT time::now();

DEFINE INDEX user_id_unique ON user FIELDS user_id UNIQUE;

-- item テーブル
DEFINE TABLE item SCHEMAFULL
  PERMISSIONS
    FOR select WHERE status != 'transferred' OR $auth.role = 'admin'
    FOR create WHERE $auth.id != NONE
    FOR update WHERE owner = $auth.id OR $auth.role = 'admin'
    FOR delete WHERE owner = $auth.id OR $auth.role = 'admin';

DEFINE FIELD owner       ON item TYPE record<user>;
DEFINE FIELD title       ON item TYPE string;
DEFINE FIELD description ON item TYPE string;
DEFINE FIELD images      ON item TYPE array<string>; -- R2のURL
DEFINE FIELD status      ON item TYPE string DEFAULT 'available';
  -- 'available' | 'negotiating' | 'transferred'
DEFINE FIELD created_at  ON item TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at  ON item TYPE datetime DEFAULT time::now();

-- want テーブル（ほしいボタン）
DEFINE TABLE want SCHEMAFULL
  PERMISSIONS
    FOR select WHERE requester = $auth.id OR item.owner = $auth.id OR $auth.role = 'admin'
    FOR create WHERE $auth.id != NONE
    FOR delete WHERE requester = $auth.id OR item.owner = $auth.id OR $auth.role = 'admin';

DEFINE FIELD item       ON want TYPE record<item>;
DEFINE FIELD requester  ON want TYPE record<user>;
DEFINE FIELD created_at ON want TYPE datetime DEFAULT time::now();
DEFINE INDEX want_item_requester ON want FIELDS item, requester UNIQUE;

-- want / item の相互更新はイベントで行う
-- event内のクエリは権限チェックなしで実行されるため、
-- requester から item 更新、owner から want 削除の境界をDB側で安全に跨げる
DEFINE EVENT on_want_create ON TABLE want
  WHEN $event = 'CREATE'
  THEN {
    UPDATE $after.item SET status = 'negotiating', updated_at = time::now();
  };

DEFINE EVENT on_want_delete ON TABLE want
  WHEN $event = 'DELETE'
  THEN {
    LET $item_id = $before.item;
    LET $remaining = (SELECT count() AS count FROM want WHERE item = $item_id GROUP ALL)[0].count;

    IF $remaining = NONE OR $remaining = 0 {
      UPDATE $item_id SET status = 'available', updated_at = time::now()
        WHERE status != 'transferred';
    };
  };

DEFINE EVENT on_item_transferred ON TABLE item
  WHEN $event = 'UPDATE' AND $before.status != 'transferred' AND $after.status = 'transferred'
  THEN {
    DELETE want WHERE item = $after.id;
  };

-- 認証（DEFINE SCOPE は v2 で削除、DEFINE ACCESS を使用）
-- ログインキーは user_id（3桁文字列） + 4桁PIN
DEFINE ACCESS user ON DATABASE TYPE RECORD
  SIGNIN (
    SELECT * FROM user
    WHERE user_id = $user_id AND crypto::argon2::compare(password, $password)
  )
  DURATION FOR TOKEN 15m FOR SESSION 1d;
```

## ステータス一覧（item.status）

| 値 | 意味 |
|----|------|
| `available` | 募集中 |
| `negotiating` | 交渉中（先着1名が「ほしい」押下済み） |
| `transferred` | 譲渡成立（非表示） |

## want テーブルの権限境界

- `want` の作成者（requester）は自分の `want` を作成・削除できる
- 出品者（item.owner）は自分の出品にぶら下がる `want` を削除できる
- `item.status` の更新や `transferred` 時の `want` 掃除は DB event が担う

この構成にすると、フロントは「ほしい」時に `want` を INSERT、「交渉決裂」時に `want` を DELETE、
「譲渡成立」時に `item.status = 'transferred'` へ UPDATE するだけでよい。
`DEFINE EVENT` 内のクエリは権限チェックなしで動くため、permission boundary をDB側で吸収できる。

## Events

| Event | Trigger | Action |
|-------|---------|--------|
| `on_want_create` | `want` CREATE | 対象 `item.status` を `negotiating` に更新 |
| `on_want_delete` | `want` DELETE | 同じ item の want が 0 件なら `available` に戻す |
| `on_item_transferred` | `item.status` が `transferred` へ遷移 | 関連 `want` を全削除 |

## JavaScript SDK サインイン（SDK v2系 / v3サーバー対応）

現在の実装（SDK v2.x）で SurrealDB v3 サーバーの `DEFINE ACCESS` にサインインする際のコード例です。

```typescript
// ログインキーは user_id（3桁文字列） + 4桁PIN
await db.signin({
  namespace: 'agemas',
  database: 'main',
  access: 'user',       // v3サーバーの DEFINE ACCESS 名を指定
  variables: {          // 変数は variables オブジェクト内にまとめる
    user_id: '001',
    password: '5678',
  },
});
```

## バージョン別の主な変更点メモ（サーバー v2/v3 基準）

| 旧（v1） | 新（v2+） |
|----------|-----------|
| `DEFINE SCOPE` | `DEFINE ACCESS ... TYPE RECORD` |
| `DEFINE TOKEN` | `DEFINE ACCESS ... TYPE JWT` |
| `$scope` 変数 | `$session.ac`（アクセスメソッド名） |
| SDK: `scope: 'user'` | SDK: `access: 'user'` |
| SDK: 変数フラット渡し | SDK: `variables: { ... }` |

| 旧（v2） | 新（v3） |
|----------|----------|
| `DURATION FOR SESSION 1d` | `DURATION FOR TOKEN 15m FOR SESSION 1d`（TOKEN期間を個別指定） |
| `<future>` 型のVALUE句 | `COMPUTED` キーワードに変更 |

## SurrealQL 構文メモ（ハマりどころ）

### DEFINE ... OVERWRITE の位置
`OVERWRITE` は**リソース種別の直後、名前の前**に置く:
```sql
-- ✅ 正しい
DEFINE TABLE OVERWRITE user SCHEMAFULL ...
DEFINE FIELD OVERWRITE user_id ON user TYPE string;
DEFINE ACCESS OVERWRITE user ON DATABASE TYPE RECORD ...

-- ❌ 間違い（構文エラー）
DEFINE TABLE user OVERWRITE SCHEMAFULL ...
```

### 型変換（キャスト）
`string::from()` は存在しない。int → string 変換は以下のいずれか:
```sql
-- ✅ キャスト記法
<string>123        -- → "123"

-- ✅ 関数記法
type::string(123)  -- → "123"

-- ❌ 存在しない
string::from(123)
```

### record ID を変数で渡すとき
`UPDATE $record_id SET ...` のように文字列変数をそのまま UPDATE 対象に渡すと失敗する。
record ID 文字列を変数で受ける場合は `type::record($record_id)` を使う:

```sql
-- ✅ 文字列 "item:xxxx" を record として扱える
UPDATE type::record($item_id) SET status = 'transferred';
DELETE want WHERE item = type::record($item_id);

-- ❌ 文字列のままでは UPDATE 対象にできない
UPDATE $item_id SET status = 'transferred';
```

### SIGNIN 時のテーブルパーミッション
`DEFINE ACCESS ... TYPE RECORD` の `SIGNIN (...)` クエリは**未認証コンテキスト**で実行される。
対象テーブルの `PERMISSIONS FOR select` に `OR $auth = NONE` がないとレコードを取得できず
`No record was returned` エラーになる:
```sql
-- ✅ SIGNIN が動作する
DEFINE TABLE user SCHEMAFULL
  PERMISSIONS
    FOR select WHERE id = $auth.id OR $auth.role = 'admin' OR $auth = NONE
    ...

-- ❌ SIGNIN でレコード取得不可
DEFINE TABLE user SCHEMAFULL
  PERMISSIONS
    FOR select WHERE id = $auth.id OR $auth.role = 'admin'
    ...
```

### フィールド権限はテーブル権限を緩和できない
SurrealDB のフィールド権限は、**テーブル権限で先に行がフィルタされた後**に評価される。
そのため「テーブルで他人の行を不可視にしておきつつ、特定フィールドだけ全員に開放」は不可。
逆方向（テーブルは開放、特定フィールドだけ制限）はそのまま機能する。

参考: [surrealdb/surrealdb#6167](https://github.com/surrealdb/surrealdb/issues/6167)

```sql
-- ❌ 機能しない（行がそもそも見えないので、フィールド権限を開放しても意味がない）
DEFINE TABLE user PERMISSIONS FOR select WHERE id = $auth.id OR $auth.role = 'admin';
DEFINE FIELD last_name ON user PERMISSIONS FOR select WHERE $auth.id != NONE;

-- ✅ 機能する（行は全員見えるが、機密フィールドはフィールド権限で隠れる）
DEFINE TABLE user PERMISSIONS FOR select WHERE $auth.id != NONE;
DEFINE FIELD password  ON user PERMISSIONS FOR select WHERE id = $auth.id OR $auth.role = 'admin';
```

### 他人行を辿る JOIN クエリで `NONE + NONE` 例外
`SELECT *, owner.last_name + owner.first_name AS owner_name FROM item` のように
他テーブルへ辿る式を使う一覧クエリで、辿り先（`user`）の行が SELECT 権限で弾かれると
`owner.last_name` / `owner.first_name` がどちらも `NONE` になる。
SurrealDB は `NONE + NONE` を計算できず例外で落ち、**一覧全体が取得不能**になる。

対処は次のいずれか:
- 辿り先テーブルの SELECT 権限を緩める（本プロジェクトの選択。表示用フィールドはほぼ公開、機密フィールドのみフィールド権限で閉じる）
- 表示名を辿り側テーブルに非正規化して保存する
- クエリ側で `?? ''` 等のフォールバックを入れる（SurrealQL では `IF ... THEN ... ELSE ...` を使う）

### 異権限境界を跨ぐ書き込みは DB Event に寄せる
クライアント側で「自分の権限で他人の行を更新する」と permission denied で必ず失敗する。
（例: 「ほしい」を押した非ownerが `item.status` を `negotiating` に更新しようとする）

`DEFINE EVENT` 内のクエリは権限チェックなしで実行されるため、
**異権限の副作用は Event に寄せ、クライアントは「主操作」だけ送る**設計にする。
本プロジェクトでは `want` テーブル変更をトリガーに `item.status` を Event 側で更新している
（`on_want_create` / `on_want_delete` / `on_item_transferred`）。

### permission denied は黙殺されやすい
クライアント側のハンドラに `try/catch` がないと、`db.query()` の `permission denied` 例外は
unhandled rejection として開発者ツールのコンソールに出るだけで、UI 上は「クリックしても何も起きない」
症状になる。**全 DB ハンドラに `try/catch` + ユーザー向けのエラー表示を入れる**こと。

### 「Run queries」エディタの namespace/database セレクタの罠
SurrealDB Cloud の Run queries エディタでは、スクリプト先頭の `USE NAMESPACE ... ; USE DATABASE ...;`
よりも **画面上のセレクタの選択が優先される場合がある**（少なくとも本プロジェクト利用時に観測）。
DDL を投入したつもりが別の namespace に入っており、検証クエリと食い違って原因究明が長引いた。

DDL 実行前は **必ず以下の3行を先に流して、結果を目視確認**してから本体クエリを流すこと:

```sql
SELECT id, ns, db FROM $session;  -- 現在の ns/db を確認
INFO FOR ROOT;                     -- 存在する namespaces を確認
INFO FOR NS;                       -- 現 namespace 内の database を確認
```

### `DEFINE TABLE OVERWRITE` 時はフィールドも併せて再投入
`DEFINE TABLE OVERWRITE` でテーブル設定（schema mode・permissions 等）を再定義する際、
既存のフィールド定義の扱いはバージョンや状況で異なる可能性がある。
**安全側に倒すため、同じバッチ内で全フィールド・インデックス・イベントも `OVERWRITE` で再定義する**:

```sql
DEFINE TABLE OVERWRITE want SCHEMAFULL PERMISSIONS ...;
DEFINE FIELD OVERWRITE item       ON want TYPE record<item>;
DEFINE FIELD OVERWRITE requester  ON want TYPE record<user>;
DEFINE FIELD OVERWRITE created_at ON want TYPE datetime DEFAULT time::now();
DEFINE INDEX OVERWRITE want_item_requester ON want FIELDS item, requester UNIQUE;
DEFINE EVENT OVERWRITE on_want_create ON want WHEN $event = 'CREATE' THEN { ... };
```

これで「table OVERWRITE がフィールドを巻き添えにしたとしても直後に復元される」状態になる。
