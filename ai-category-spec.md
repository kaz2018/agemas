# AI カテゴリ自動付与 実装仕様

## 概要

出品時にタイトル・説明文を Google AI Studio（Gemini）に送り、カテゴリを自動判定して `item` レコードに保存する。
一覧画面にはカテゴリフィルタを追加する。

---

## 1. SurrealDB スキーマ変更

`item` テーブルに以下4フィールドを追加する。プロジェクトルートの `surql.sh` で実行する。

```sql
DEFINE FIELD OVERWRITE category_type   ON item TYPE option<string>;
DEFINE FIELD OVERWRITE category_age    ON item TYPE option<string>;
DEFINE FIELD OVERWRITE category_gender ON item TYPE option<string>;
DEFINE FIELD OVERWRITE category_size   ON item TYPE option<string>;
```

---

## 2. 型定義の更新

**ファイル**: `src/lib/types.ts`

`Item` 型に以下を追加する（既存フィールドは変更しない）。

```typescript
export type Item = {
  // ...既存フィールドはそのまま...

  // カテゴリ（AI自動付与）
  category_type?: string; // 品目
  category_age?: string; // 対象年齢
  category_gender?: string; // 性別
  category_size?: string; // サイズ（服の場合のみ）
};
```

---

## 3. カテゴリ判定 API エンドポイント

**新規作成**: `src/routes/api/categorize/+server.ts`

### 仕様

- メソッド: `POST`
- リクエストボディ: `{ title: string, description: string }`
- レスポンス: `{ category_type, category_age, category_gender, category_size }`
- API キー: `platform.env.GOOGLE_AI_API_KEY`（`/api/upload` と同じ `platform` 経由で取得）

### カテゴリ定義（AIへの指示に含める）

| フィールド        | 選択肢                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| `category_type`   | `"服・小物"` / `"おもちゃ・ゲーム"` / `"絵本・本・教材"` / `"育児用品"` / `"その他"`                                |
| `category_age`    | `"未満児（〜2歳）"` / `"幼児（3〜6歳）"` / `"小学生低学年（7〜9歳）"` / `"小学生高学年（10〜12歳）"` / `"年齢不問"` |
| `category_gender` | `"男の子"` / `"女の子"` / `"兼用"`                                                                                  |
| `category_size`   | 説明文から抽出した文字列（例: `"80cm"`）。`category_type` が `"服・小物"` 以外なら `null`                           |

### Gemini API 呼び出し

```typescript
const apiKey = platform?.env?.GOOGLE_AI_API_KEY;
const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;

const prompt = `
以下の子供用おさがり品の出品情報を分析し、カテゴリをJSON形式で返してください。
必ず下記の選択肢の値をそのまま使用してください。

category_type の選択肢: "服・小物", "おもちゃ・ゲーム", "絵本・本・教材", "育児用品", "その他"
category_age の選択肢: "未満児（〜2歳）", "幼児（3〜6歳）", "小学生低学年（7〜9歳）", "小学生高学年（10〜12歳）", "年齢不問"
category_gender の選択肢: "男の子", "女の子", "兼用"
category_size: category_typeが"服・小物"の場合のみ説明文からサイズを抽出（例: "80cm"）。それ以外はnull。

タイトル: ${title}
説明: ${description}

JSONのみ返してください。例:
{"category_type":"服・小物","category_age":"未満児（〜2歳）","category_gender":"男の子","category_size":"80cm"}
`;

const res = await fetch(endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json" },
  }),
});

const data = await res.json();
const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
const categories = JSON.parse(text);
```

### エラーハンドリング

- API キーがない場合: `500` を返す
- Gemini 呼び出し失敗・JSON パース失敗: `{ category_type: null, category_age: null, category_gender: null, category_size: null }` を返してもよい（カテゴリなしで出品を続行させるため）

---

## 4. 出品フォームの更新

**ファイル**: `src/routes/items/new/+page.svelte`

`handleSubmit` 内で、画像アップロード後・SurrealDB INSERT 前に `/api/categorize` を呼ぶ。

```typescript
// 画像アップロード後
const imageKeys = await uploadImages(selectedFiles);

// カテゴリ判定
let categories = {
  category_type: null,
  category_age: null,
  category_gender: null,
  category_size: null,
};
try {
  const catRes = await fetch("/api/categorize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: title.trim(),
      description: description.trim(),
    }),
  });
  if (catRes.ok) categories = await catRes.json();
} catch {
  // カテゴリ付与失敗は無視して続行
}

// SurrealDB INSERT（カテゴリを追加）
await db.query(
  `INSERT INTO item {
    owner: $auth.id,
    title: $title,
    description: $description,
    images: $images,
    status: 'available',
    category_type: $category_type,
    category_age: $category_age,
    category_gender: $category_gender,
    category_size: $category_size
  }`,
  {
    title: title.trim(),
    description: description.trim(),
    images: imageKeys,
    ...categories,
  },
);
```

`submitting` 中のメッセージを `"カテゴリを判定中..."` → `"出品中..."` と段階表示してもよいが、必須ではない。

---

## 5. 出品編集フォームの更新

**ファイル**: `src/routes/items/[id]/edit/+page.svelte`

`handleSubmit` 内で、アップロード後・UPDATE 前に `/api/categorize` を呼ぶ。

```typescript
const newKeys = await uploadImages(newFiles);
const images = [...existingImages, ...newKeys];

// カテゴリ再判定
let categories = {
  category_type: null,
  category_age: null,
  category_gender: null,
  category_size: null,
};
try {
  const catRes = await fetch("/api/categorize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: title.trim(),
      description: description.trim(),
    }),
  });
  if (catRes.ok) categories = await catRes.json();
} catch {
  /* 無視 */
}

await db.query(
  `UPDATE type::record("item", $id)
   SET title=$title, description=$description, images=$images, updated_at=time::now(),
       category_type=$category_type, category_age=$category_age,
       category_gender=$category_gender, category_size=$category_size`,
  {
    id: itemId,
    title: title.trim(),
    description: description.trim(),
    images,
    ...categories,
  },
);
```

---

## 6. 一覧画面にフィルタ UI を追加

**ファイル**: `src/routes/+page.svelte`

### フィルタ状態

```typescript
let filterType = $state(""); // '' = すべて
let filterAge = $state("");
let filterGender = $state("");
```

### フィルタ適用（クライアントサイド）

```typescript
const filteredItems = $derived(
  items.filter((item) => {
    if (filterType && item.category_type !== filterType) return false;
    if (filterAge && item.category_age !== filterAge) return false;
    if (filterGender && item.category_gender !== filterGender) return false;
    return true;
  }),
);
```

一覧の `{#each items as item}` を `{#each filteredItems as item}` に変更する。

### フィルタ UI（ヘッダー直下、`<main>` の先頭に配置）

```html
<div class="mx-auto flex max-w-6xl flex-wrap gap-2 px-4 pt-4">
  <select
    bind:value="{filterType}"
    class="rounded border border-gray-300 px-2 py-1 text-sm"
  >
    <option value="">品目: すべて</option>
    <option>服・小物</option>
    <option>おもちゃ・ゲーム</option>
    <option>絵本・本・教材</option>
    <option>育児用品</option>
    <option>その他</option>
  </select>

  <select
    bind:value="{filterAge}"
    class="rounded border border-gray-300 px-2 py-1 text-sm"
  >
    <option value="">年齢: すべて</option>
    <option>未満児（〜2歳）</option>
    <option>幼児（3〜6歳）</option>
    <option>小学生低学年（7〜9歳）</option>
    <option>小学生高学年（10〜12歳）</option>
    <option>年齢不問</option>
  </select>

  <select
    bind:value="{filterGender}"
    class="rounded border border-gray-300 px-2 py-1 text-sm"
  >
    <option value="">性別: すべて</option>
    <option>男の子</option>
    <option>女の子</option>
    <option>兼用</option>
  </select>

  {#if filterType || filterAge || filterGender}
  <button onclick="{()" ="">
    { filterType = ''; filterAge = ''; filterGender = ''; }} class="text-xs
    text-gray-400 hover:text-gray-600"> リセット
  </button>
  {/if}
</div>
```

### カード内にカテゴリバッジ表示（任意）

各アイテムカードの画像下などに以下を追加してもよい。

```html
{#if item.category_type}
<div class="flex flex-wrap gap-1 text-xs">
  <span class="rounded-full bg-gray-100 px-2 py-0.5 text-gray-500"
    >{item.category_type}</span
  >
  {#if item.category_age}
  <span class="rounded-full bg-gray-100 px-2 py-0.5 text-gray-500"
    >{item.category_age}</span
  >
  {/if} {#if item.category_gender}
  <span class="rounded-full bg-gray-100 px-2 py-0.5 text-gray-500"
    >{item.category_gender}</span
  >
  {/if} {#if item.category_size}
  <span class="rounded-full bg-blue-50 px-2 py-0.5 text-blue-500"
    >{item.category_size}</span
  >
  {/if}
</div>
{/if}
```

---

## 実装順序

1. SurrealDB DDL 実行（`surql.sh` で4フィールド追加）
2. `src/lib/types.ts` にカテゴリフィールドを追加
3. `src/routes/api/categorize/+server.ts` を新規作成
4. `src/routes/items/new/+page.svelte` を更新
5. `src/routes/items/[id]/edit/+page.svelte` を更新
6. `src/routes/+page.svelte` にフィルタを追加

## 注意事項

- `platform.env.GOOGLE_AI_API_KEY` はローカルでは `.dev.vars` から、本番では Cloudflare Dashboard の Environment variables から読む（設定済み）
- モデルは `gemini-3-flash-preview` を使う
- Gemini API は `responseMimeType: 'application/json'` を指定することで JSON のみ返ってくる
- カテゴリ付与失敗時は出品を止めずに続行する（カテゴリなしで保存）
- 既存の `item` レコードにはカテゴリフィールドがないため、フィルタは `undefined` を空文字と同等に扱う（上記 `$derived` の実装で自然に対応済み）
