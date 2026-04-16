/**
 * SurrealDB 診断テスト（root認証対応版）
 * - DEFINE ACCESS の存在確認
 * - user テーブルのデータ確認
 * - パスワードハッシュの確認
 * - テストユーザー作成 + ログインテスト
 *
 * 実行: node test-surreal/test-diagnose.mjs <root-user> <root-pass>
 * 例:   node test-surreal/test-diagnose.mjs root mypassword
 */
import { Surreal } from '../node_modules/surrealdb/dist/surrealdb.mjs';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// コマンドライン引数から認証情報を取得
const rootUser = process.argv[2];
const rootPass = process.argv[3];

if (!rootUser || !rootPass) {
  console.error('使い方: node test-surreal/test-diagnose.mjs <root-user> <root-pass>');
  console.error('例:     node test-surreal/test-diagnose.mjs root mypassword');
  console.error('\nSurrealDB Cloud ダッシュボードで確認した root 認証情報を指定してください。');
  process.exit(1);
}

// .env から URL を読み込む
let url = 'ws://localhost:8000';
try {
  const env = readFileSync(resolve(__dirname, '../.env'), 'utf-8');
  const match = env.match(/PUBLIC_SURREALDB_URL=(.+)/);
  if (match) url = match[1].trim();
} catch {
  console.warn('.env が見つかりません。ws://localhost:8000 を使用します。');
}

console.log('=== SurrealDB 診断テスト ===');
console.log('URL:', url);
console.log('認証ユーザー:', rootUser);
console.log('');

const db = new Surreal();

try {
  // --- Step 1: root権限で接続・認証 ---
  console.log('[1] 接続中...');
  await db.connect(url);

  console.log('[1] root認証中...');
  await db.signin({ username: rootUser, password: rootPass });
  await db.use({ namespace: 'agemas', database: 'main' });
  console.log('[1] 接続・認証成功\n');

  // --- Step 2: DEFINE ACCESS の確認 ---
  console.log('[2] DEFINE ACCESS 確認...');
  try {
    const infoResult = await db.query('INFO FOR DB');
    console.log('[2] DB INFO:', JSON.stringify(infoResult, null, 2));
  } catch (e) {
    console.log('[2] INFO FOR DB 失敗 (権限不足の可能性):', e.message);
  }
  console.log('');

  // --- Step 3: user テーブルのデータ確認 ---
  console.log('[3] user テーブルのデータ確認...');
  try {
    const users = await db.query('SELECT user_id, first_name, last_name, role, string::len(password) AS pw_len FROM user');
    console.log('[3] ユーザー一覧:', JSON.stringify(users, null, 2));
    if (users[0]?.length === 0) {
      console.log('[3] ⚠️  user テーブルにデータがありません！');
    }
  } catch (e) {
    console.log('[3] user テーブル参照失敗:', e.message);
  }
  console.log('');

  // --- Step 4: user_id=1 のレコードを直接確認 ---
  console.log('[4] user_id=1 のレコード確認...');
  try {
    const user1 = await db.query('SELECT * FROM user WHERE user_id = 1');
    console.log('[4] 結果:', JSON.stringify(user1, null, 2));
  } catch (e) {
    console.log('[4] 失敗:', e.message);
  }
  console.log('');

  // --- Step 5: argon2ハッシュのテスト ---
  console.log('[5] argon2 ハッシュ生成テスト...');
  try {
    const hashResult = await db.query("RETURN crypto::argon2::generate('1234')");
    console.log('[5] ハッシュ例:', hashResult);

    // 既存ユーザーのパスワードと比較テスト
    const compareResult = await db.query(
      "SELECT crypto::argon2::compare(password, '1234') AS pw_match FROM user WHERE user_id = 1"
    );
    console.log('[5] user_id=1 のパスワード比較結果:', JSON.stringify(compareResult, null, 2));
  } catch (e) {
    console.log('[5] 失敗:', e.message);
  }
  console.log('');

  // --- Step 6: テストユーザー作成してログインテスト ---
  console.log('[6] テストユーザー作成 + ログインテスト...');
  try {
    // テストユーザー作成（user_id=999）
    const createResult = await db.query(`
      DELETE user WHERE user_id = 999;
      CREATE user SET
        user_id = 999,
        first_name = 'テスト',
        last_name = 'ユーザー',
        password = crypto::argon2::generate('0000'),
        role = 'user'
    `);
    console.log('[6] テストユーザー作成:', JSON.stringify(createResult, null, 2));

    // 新しい接続でログインテスト
    const db2 = new Surreal();
    await db2.connect(url, { namespace: 'agemas', database: 'main' });

    const token = await db2.signin({
      namespace: 'agemas',
      database: 'main',
      access: 'user',
      variables: { user_id: 999, password: '0000' }
    });
    console.log('[6] ✅ テストユーザーでログイン成功! token:', token ? '受信' : 'なし');

    const authResult = await db2.query('SELECT * FROM $auth');
    console.log('[6] $auth:', JSON.stringify(authResult, null, 2));

    await db2.close();

    // テストユーザー削除
    await db.query('DELETE user WHERE user_id = 999');
    console.log('[6] テストユーザー削除完了');
  } catch (e) {
    console.log('[6] ❌ 失敗:', e.message);
    // テストユーザー削除試行
    try { await db.query('DELETE user WHERE user_id = 999'); } catch {}
  }

  await db.close();
  console.log('\n=== 診断完了 ===');
} catch (e) {
  console.error('\n❌ 致命的エラー:', e.message ?? e);
  process.exit(1);
}
