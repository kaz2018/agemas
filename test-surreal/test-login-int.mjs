import { Surreal } from "../node_modules/surrealdb/dist/surrealdb.mjs";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
let baseUrl = "ws://localhost:8000";
try {
  const env = readFileSync(resolve(__dirname, "../.env"), "utf-8");
  const match = env.match(/PUBLIC_SURREALDB_URL=(.+)/);
  if (match) baseUrl = match[1].trim().replace(/\/rpc$/, "");
} catch {}

const NS = "agemas";
const DB = "main";
const LAST_NAME = process.argv[2] ?? "やまだ";
const FIRST_NAME = process.argv[3] ?? "たろう";
const PASSWORD = process.argv[4] ?? "1234";

async function testLogin(lastName, firstName) {
  const db = new Surreal();
  try {
    await db.connect(baseUrl);
    const token = await db.signin({
      namespace: NS,
      database: DB,
      access: "user",
      variables: {
        last_name: lastName,
        first_name: firstName,
        password: PASSWORD,
      },
    });
    console.log(`[SUCCESS] login with name:`, `${lastName} ${firstName}`);
  } catch (e) {
    console.log(
      `[FAIL] login with name:`,
      `${lastName} ${firstName}`,
      "Error:",
      e.message,
    );
  } finally {
    await db.close();
  }
}

await testLogin(LAST_NAME, FIRST_NAME);
await testLogin(` ${LAST_NAME}`, FIRST_NAME);
await testLogin(LAST_NAME, `${FIRST_NAME} `);
