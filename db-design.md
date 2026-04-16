# DB設計（SurrealDB）

SurrealDB v3の構文を使用。`DEFINE SCOPE`はv2で削除済みのため`DEFINE ACCESS`を使用する。

## スキーマ定義

```sql
USE NAMESPACE agemas;
USE DATABASE main;

-- user テーブル
-- ※ SELECT に `OR $auth = NONE` を追加: DEFINE ACCESS の SIGNIN クエリは
--   未認証コンテキストで実行されるため、これがないとレコードを取得できない
DEFINE TABLE user SCHEMAFULL
  PERMISSIONS
    FOR select WHERE id = $auth.id OR $auth.role = 'admin'
    FOR create WHERE $auth.role = 'admin'
    FOR update WHERE id = $auth.id OR $auth.role = 'admin'
    FOR delete WHERE $auth.role = 'admin';

DEFINE FIELD user_id    ON user TYPE string;   -- 3桁ゼロ埋め文字列（例: "001"）
DEFINE FIELD last_name  ON user TYPE string;   -- 姓（ひらがな、表示用）
DEFINE FIELD first_name ON user TYPE string;   -- 名（ひらがな、表示用）
DEFINE FIELD password   ON user TYPE string;   -- argon2ハッシュ
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
    FOR delete WHERE requester = $auth.id OR $auth.role = 'admin';

DEFINE FIELD item       ON want TYPE record<item>;
DEFINE FIELD requester  ON want TYPE record<user>;
DEFINE FIELD created_at ON want TYPE datetime DEFAULT time::now();

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

## JavaScript SDK サインイン（v3.0.0）

```typescript
// ログインキーは user_id（3桁文字列） + 4桁PIN
await db.signin({
  namespace: 'agemas',
  database: 'main',
  access: 'user',       // v2以前は 'scope'
  variables: {          // v2以前はフラットに渡していた
    user_id: '001',
    password: '5678',
  },
});
```

## バージョン別の主な変更点メモ

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
