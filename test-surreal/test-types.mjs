import { Surreal } from "../node_modules/surrealdb/dist/surrealdb.mjs";

// ※URLはご自身の環境に合わせてください
const url =
  "wss://surreal-dragon-06emvh2un1o932cjgupvfh8eno.aws-aps1.surreal.cloud/rpc";

const LAST_NAME = process.argv[2] ?? "やまだ";
const FIRST_NAME = process.argv[3] ?? "たろう";
const PASSWORD = "1234";

const db = new Surreal();

async function runTest() {
  try {
    console.log("=== 1. JS側 (送信前) のデータと型 ===");
    console.log("LAST_NAME :", { value: LAST_NAME, type: typeof LAST_NAME });
    console.log("FIRST_NAME:", { value: FIRST_NAME, type: typeof FIRST_NAME });
    console.log("PASSWORD :", { value: PASSWORD, type: typeof PASSWORD });

    console.log("\n[接続中...]");
    await db.connect(url, { namespace: "agemas", database: "main" });

    console.log("\n=== 2. SurrealDB側 (受信後) のデータと型 ===");
    // SIGNINではなく通常のqueryを使い、変数を送ってDBに「どう認識したか」を返させる
    // type::of() は SurrealDB 組み込みの型判定関数です
    const result = await db.query(
      `
      RETURN {
        received_last_name: $last_name,
        db_type_of_last_name: type::of($last_name),
        received_first_name: $first_name,
        db_type_of_first_name: type::of($first_name),
        received_password: $password,
        db_type_of_password: type::of($password)
      };
    `,
      {
        last_name: LAST_NAME,
        first_name: FIRST_NAME,
        password: PASSWORD,
      },
    );

    // 結果の表示
    console.log(JSON.stringify(result[0], null, 2));

    await db.close();
  } catch (e) {
    console.error("エラー:", e.message);
  }
}

runTest();
