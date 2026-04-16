import { Surreal } from 'surrealdb';
import { PUBLIC_SURREALDB_URL } from '$env/static/public';

// SurrealDB Cloud への接続インスタンス（シングルトン）
export const db = new Surreal();

/**
 * SurrealDB Cloud に接続する
 * namespace/database をここで設定し、db.signin() で認証する
 */
export async function connectDB() {
	const url = (PUBLIC_SURREALDB_URL ?? 'ws://localhost:8000').replace(/\/rpc$/, '');
	console.log('[DB] Connecting to:', url);
	// db.connectは既に接続済みの場合は再接続するか無視するため複数回呼んでも問題ない（HMR対策）
	await db.connect(url, { namespace: 'agemas', database: 'main' });
	console.log('[DB] Connected successfully');
}
