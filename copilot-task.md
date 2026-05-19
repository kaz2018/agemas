# Copilot 実装タスク: 目的・Q&Aページの追加

## 概要

「おさがり掲示板」アプリに、サービスの目的を説明するページ（`/about`）と
よくある質問ページ（`/qa`）を追加する。
どちらも未ログインユーザーが見られる独立したページにする。

技術スタック: SvelteKit (SPA mode) + Svelte 5 (runes) + Tailwind CSS v4

---

## タスク一覧

### 1. `src/routes/+layout.svelte` を修正

`/about` と `/qa` をログイン不要のパスとして扱う。

#### 変更箇所（`$effect` ブロックのみ）

変更前:

```svelte
$effect(() => {
    if (!auth.loading && !auth.user && $page.url.pathname !== '/login') {
        goto('/login');
    }
});
```

変更後:

```svelte
const publicPaths = ['/login', '/about', '/qa'];

$effect(() => {
    if (!auth.loading && !auth.user && !publicPaths.includes($page.url.pathname)) {
        goto('/login');
    }
});
```

---

### 2. `src/routes/+page.svelte` のヘッダーを修正

現在のヘッダー（掲示板トップ）に `目的` と `Q&A` へのリンクを追加し、
スマホでは折りたたみメニュー（ハンバーガー）にする。

#### 現在のヘッダー部分（309〜338行目付近）

```svelte
<header class="border-b bg-white px-4 py-3 shadow-sm">
  <div
    class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3"
  >
    <h1 class="text-lg font-bold text-gray-800">おさがり掲示板</h1>
    <div class="flex items-center gap-3">
      <span class="text-sm text-gray-500">
        {formatFullName(auth.user?.last_name, auth.user?.first_name)}
      </span>
      <a
        href="/items/new"
        class="rounded bg-blue-500 px-3 py-1 text-sm font-medium text-white hover:bg-blue-600"
      >
        ＋ 出品する
      </a>
      {#if auth.user?.role === "admin"}
        <a href="/admin" class="text-sm text-gray-400 hover:text-gray-600"
          >管理</a
        >
      {/if}
      <button
        onclick={handleLogout}
        class="text-sm text-gray-400 hover:text-gray-600"
      >
        ログアウト
      </button>
    </div>
  </div>
</header>
```

#### 変更後のヘッダー

以下の要件で実装すること:

- 左側: `おさがり掲示板`（テキストのまま、リンクにしない）
- 右側 PC（`md:flex`）: ユーザー名、＋出品する、目的、Q&A、管理（adminのみ）、ログアウト を横並び
- 右側 スマホ（`md:hidden`）: `≡` ボタンで開閉するドロップダウンメニュー
  - メニュー内に: 目的、Q&A、管理（adminのみ）、ログアウト を縦並び
  - ＋出品する と ユーザー名 はドロップダウン外（常時表示）

`script` ブロックに開閉状態を追加:

```typescript
let menuOpen = $state(false);
```

---

### 3. `src/routes/about/+page.svelte` を新規作成

#### ページ構成

- ヘッダー: サービス名（左）＋ 「掲示板を見る →」ボタン（右）
  - サービス名は `/` へのリンク
  - 「掲示板を見る →」も `/` へのリンク（青いボタン）
- メインコンテンツ: 2つの目的を説明

#### 表示内容

**ページタイトル**: このサービスについて

**目的1**:

- 見出し: おさがりをスムーズに
- 本文: 子ども服や育児グッズのおさがりを、必要な人へ直接つなぎます。処分の手間もかからず、お金をかけずに子育てできる仕組みを目指しています。

**目的2**:

- 見出し: ママさんたちのつながりを育てる
- 本文: 物のやり取りをきっかけに、麻績村・筑北村のママさんたちが気軽に助け合えるコミュニティを作りたいと思っています。

#### デザイン指針

- 既存ページと同じ Tailwind CSS スタイル（白背景、グレー系テキスト、シンプル）
- ログイン不要のページなので、`auth` や `db` は一切 import しない
- `<script>` ブロックは最小限（不要なら書かない）

---

### 4. `src/routes/qa/+page.svelte` を新規作成

#### ページ構成

- ヘッダー: about ページと同じ構成
  - サービス名（左・`/`へのリンク）
  - 「掲示板を見る →」ボタン（右）
- メインコンテンツ: Q&A 2件

#### 表示内容

**ページタイトル**: よくある質問

**Q1**: 対象範囲は？
**A1**: 麻績村・筑北村にお住まいの、子育て世代のママさん限定です。地域コミュニティの活性化を目的としているため、対象エリアを絞っています。子ども以外のおさがりのやり取りは、別サービスとして検討中です。

**Q2**: 新規登録したい場合は？
**A2**: 管理者（宮川）までご連絡ください。

#### デザイン指針

- about ページと同じヘッダー・スタイル
- Q&A は質問を太字・強調、回答は通常テキスト
- `auth` や `db` は import しない

---

## 注意事項

- Svelte 5 の runes 記法（`$state`, `$derived`, `$effect`, `$props`）を使うこと
- `let` で状態を宣言する旧記法は使わないこと（Svelte 4 以前の書き方）
- Tailwind CSS v4 を使用。`@apply` は使わず、クラス直書きで実装すること
- 新しいルートディレクトリ（`about/`, `qa/`）を作成してからファイルを置くこと
