import { db, connectDB } from './db';

// ログインユーザーの型
export type AuthUser = {
	id: string;
	user_id: number;
	first_name: string;
	last_name: string;
	role: 'user' | 'admin';
};

// グローバルな認証状態（$state は .svelte.ts ファイル内で使用可能）
export const auth = $state<{ user: AuthUser | null; loading: boolean }>({
	user: null,
	loading: true
});

// $auth レコードを取得するヘルパー
async function fetchAuthUser(): Promise<AuthUser | null> {
	const result = await db.query<[AuthUser[]]>('SELECT * FROM $auth');
	return result[0]?.[0] ?? null;
}

// アプリ起動時に既存セッションを復元する
export async function initAuth() {
	try {
		await connectDB();
		auth.user = await fetchAuthUser();
	} catch {
		auth.user = null;
	} finally {
		auth.loading = false;
	}
}

// ログイン: user_id（整数）+ 4桁PIN
export async function login(userId: number, password: string) {
	await connectDB();
	await db.signin({
		namespace: 'agemas',
		database: 'main',
		access: 'user',
		variables: { user_id: userId, password }
	});
	auth.user = await fetchAuthUser();
}

// ログアウト
export async function logout() {
	await db.invalidate();
	auth.user = null;
}
