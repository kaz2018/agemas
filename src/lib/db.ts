import { Surreal } from 'surrealdb';
import { PUBLIC_SURREALDB_URL } from '$env/static/public';

// SurrealDB Cloud への接続インスタンス（シングルトン）
export const db = new Surreal();

// 二重接続防止フラグ
let connected = false;

/**
 * SurrealDB Cloud に接続する（一度だけ実行）
 * namespace/database をここで設定し、db.signin() で認証する
 */
export async function connectDB() {
	if (connected) return;
	const url = PUBLIC_SURREALDB_URL ?? 'ws://localhost:8000';
	console.log('[DB] Connecting to:', url);
	await db.connect(url, { namespace: 'agemas', database: 'main' });
	connected = true;
	console.log('[DB] Connected successfully');
}
