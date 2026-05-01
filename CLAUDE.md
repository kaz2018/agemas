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

## 各ステップ完了時のルール

各ステップが完了するたびに、以下を必ず行うこと。

1. **`setup-guide.md` を更新する**
   - 完了したステップの「（実施後に追記）」を実際の手順・コマンド・注意点に書き換える
   - バージョン固有のハマりどころや回避策も記録する
   - 別の団体が同じアプリを構築できるレベルの粒度で書く

2. **コミット・プッシュする**
   - ステップ完了時にその変更をまとめて1コミットにする
   - コミットメッセージは英語で変更内容を簡潔に記述する

## SurrealDB へのクエリ実行

プロジェクトルートの `surql.sh` を使って Claude Code から直接クエリを実行できる。

```bash
./surql.sh "SELECT * FROM user LIMIT 5"
./surql.sh "INFO FOR DB"
./surql.sh "SELECT * FROM item WHERE status = 'available'"
```

- 認証情報（endpoint / user / pass）は `~/.claude/settings.json` の `env` に設定済み
- namespace / database はプロジェクトの `.env` から読み込む（`SURREALDB_NS=agemas`, `SURREALDB_DB=main`）
- セミコロンで複数ステートメントを連結可能: `./surql.sh "USE NS agemas; SELECT * FROM user"`

## 要件・DB設計

- `requirements.md` を参照
- `db-design.md` を参照
