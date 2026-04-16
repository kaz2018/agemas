import { db, connectDB } from './db';

// ログインユーザーの型
export type AuthUser = {
	id: string;
	user_id: string; // 3桁ゼロ埋め文字列 例: "001"
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

// アプリ起動時: 接続は行わず loading を解除するだけ
// 接続・認証は login() で行う（ページリロード時は再ログインが必要）
export async function initAuth() {
	auth.loading = false;
}

// ログイン: user_id（3桁文字列: "001"など）+ 4桁PIN
export async function login(userId: string, password: string) {
	await connectDB();
	console.log('[Auth] Signing in with user_id:', userId);
	const token = await db.signin({
		namespace: 'agemas',
		database: 'main',
		access: 'user',
		variables: { user_id: userId, password }
	});
	console.log('[Auth] Signin result:', token);
	auth.user = await fetchAuthUser();
	console.log('[Auth] User:', auth.user);
}

// ログアウト
export async function logout() {
	await db.invalidate();
	auth.user = null;
}
