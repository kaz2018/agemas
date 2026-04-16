import { Surreal } from '../node_modules/surrealdb/dist/surrealdb.mjs';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
let baseUrl = 'ws://localhost:8000';
try {
  const env = readFileSync(resolve(__dirname, '../.env'), 'utf-8');
  const match = env.match(/PUBLIC_SURREALDB_URL=(.+)/);
  if (match) baseUrl = match[1].trim().replace(/\/rpc$/, '');
} catch {}

const NS = 'agemas';
const DB = 'main';
const PASSWORD = '1234';

async function testLogin(uid) {
  const db = new Surreal();
  try {
    await db.connect(baseUrl);
    const token = await db.signin({
      namespace: NS, database: DB, access: 'user',
      variables: { user_id: uid, password: PASSWORD }
    });
    console.log(`[SUCCESS] login with user_id:`, uid, typeof uid);
  } catch (e) {
    console.log(`[FAIL] login with user_id:`, uid, typeof uid, 'Error:', e.message);
  } finally {
    await db.close();
  }
}

await testLogin('001');
await testLogin('1');
await testLogin(1);
