/**
 * SurrealDB Cloud ログインテスト（複数パターン試行）
 * 実行: node test-surreal/test-login.mjs
 */
import { Surreal } from '../node_modules/surrealdb/dist/surrealdb.mjs';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let baseUrl = 'ws://localhost:8000';
try {
  const env = readFileSync(resolve(__dirname, '../.env'), 'utf-8');
  const match = env.match(/PUBLIC_SURREALDB_URL=(.+)/);
  if (match) baseUrl = match[1].trim().replace(/\/rpc$/, ''); // /rpc を除去
} catch {
  console.warn('.env が見つかりません');
}

const USER_ID = '001';
const PASSWORD = '1234';
const NS = 'agemas';
const DB = 'main';

console.log('=== SurrealDB ログインテスト ===');
console.log('Base URL:', baseUrl);
console.log('');

// --- HTTP API テスト ---
async function testHttp() {
  console.log('【A】HTTP API テスト');
  const httpUrl = baseUrl.replace(/^wss?:\/\//, 'https://');
  try {
    const res = await fetch(`${httpUrl}/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ ns: NS, db: DB, ac: 'user', user_id: USER_ID, password: PASSWORD })
    });
    const data = await res.json();
    console.log(`  HTTP ${res.status}:`, JSON.stringify(data).slice(0, 200));
  } catch (e) {
    console.log('  失敗:', e.message);
  }
  console.log('');
}

// --- WebSocket テスト ---
async function testWs(label, connectOpts, signinOpts) {
  console.log(`【${label}】`);
  const db = new Surreal();
  try {
    const url = connectOpts.rpc ? baseUrl + '/rpc' : baseUrl;
    await db.connect(url, connectOpts.init ?? {});
    console.log('  接続: OK');

    const token = await db.signin(signinOpts);
    console.log('  ✅ サインイン成功! token:', token ? token.slice(0, 30) + '...' : 'なし');

    const result = await db.query('SELECT id, user_id, role FROM $auth');
    console.log('  $auth:', JSON.stringify(result[0]));
    await db.close();
  } catch (e) {
    console.log('  ❌ 失敗:', e.message);
    try { await db.close(); } catch {}
  }
  console.log('');
}

await testHttp();

// パターン1: /rpc なし、接続時に NS/DB、変数は variables でネスト
await testWs('B: /rpc なし + NS/DB in connect + variables', {
  init: { namespace: NS, database: DB }
}, {
  namespace: NS, database: DB, access: 'user',
  variables: { user_id: USER_ID, password: PASSWORD }
});

// パターン2: /rpc あり、接続時に NS/DB、変数は variables でネスト
await testWs('C: /rpc あり + NS/DB in connect + variables', {
  rpc: true,
  init: { namespace: NS, database: DB }
}, {
  namespace: NS, database: DB, access: 'user',
  variables: { user_id: USER_ID, password: PASSWORD }
});

// パターン3: 接続オプションなし、signin で NS/DB + variables
await testWs('D: 接続オプションなし + signin で NS/DB + variables', {
  init: {}
}, {
  namespace: NS, database: DB, access: 'user',
  variables: { user_id: USER_ID, password: PASSWORD }
});

// パターン4: 変数をトップレベルで渡す（variables なし）
await testWs('E: 変数をトップレベルで渡す', {
  init: {}
}, {
  namespace: NS, database: DB, access: 'user',
  user_id: USER_ID, password: PASSWORD
});
