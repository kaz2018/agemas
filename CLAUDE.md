# agemas プロジェクトルール

## コマンド・API実行前の確認事項

**SvelteKit / Svelte / SurrealDB など、バージョンアップが頻繁なライブラリのコマンドやAPIを実行する前に、必ず最新の公式ドキュメントをWebで確認してから実行すること。**

- SvelteKitはバージョンによってコマンド・設定ファイルの書き方が大きく変わる（例: adapter設定、routing規則、`+layout.ts` の扱いなど）
- SurrealDBはv1→v2→v3でSDKのAPIが変更されている（`DEFINE SCOPE` → `DEFINE ACCESS`、`scope:` → `access:` など）
- 古い書き方・非推奨な記法になっていないか確認してから提示・実行する

## 技術スタック

| レイヤー | 技術 |
|----------|------|
| Frontend | SvelteKit（SPA mode）+ Svelte 5 (runes) |
| Database | SurrealDB Cloud |
| Storage | Cloudflare R2（画像） |
| Hosting | Cloudflare Pages |
| Adapter | @sveltejs/adapter-cloudflare |
| CSS | Tailwind CSS v4 |

## 要件・DB設計

- `requirements.md` を参照
- `db-design.md` を参照
