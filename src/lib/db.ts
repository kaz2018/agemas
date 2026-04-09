import { Surreal } from 'surrealdb';

// SurrealDB Cloud への接続インスタンス（シングルトン）
export const db = new Surreal();

/**
 * SurrealDB Cloud に接続する
 * 環境変数 PUBLIC_SURREALDB_URL が設定されていない場合はローカル開発用URLを使用
 */
export async function connectDB() {
	const url = import.meta.env.PUBLIC_SURREALDB_URL ?? 'ws://localhost:8000';
	await db.connect(url, {
		namespace: 'agemas',
		database: 'main'
	});
}
