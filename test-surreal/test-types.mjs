import { Surreal } from '../node_modules/surrealdb/dist/surrealdb.mjs';

// ※URLはご自身の環境に合わせてください
const url = 'wss://surreal-dragon-06emvh2un1o932cjgupvfh8eno.aws-aps1.surreal.cloud/rpc';

const USER_ID = '001';
const PASSWORD = '1234';

const db = new Surreal();

async function runTest() {
    try {
        console.log('=== 1. JS側 (送信前) のデータと型 ===');
        console.log('USER_ID  :', { value: USER_ID, type: typeof USER_ID });
        console.log('PASSWORD :', { value: PASSWORD, type: typeof PASSWORD });

        console.log('\n[接続中...]');
        await db.connect(url, { namespace: 'agemas', database: 'main' });

        console.log('\n=== 2. SurrealDB側 (受信後) のデータと型 ===');
        // SIGNINではなく通常のqueryを使い、変数を送ってDBに「どう認識したか」を返させる
        // type::of() は SurrealDB 組み込みの型判定関数です
        const result = await db.query(`
      RETURN {
        received_user_id: $user_id,
        db_type_of_user_id: type::of($user_id),
        received_password: $password,
        db_type_of_password: type::of($password)
      };
    `, {
            user_id: USER_ID,
            password: PASSWORD
        });

        // 結果の表示
        console.log(JSON.stringify(result[0], null, 2));

        await db.close();
    } catch (e) {
        console.error('エラー:', e.message);
    }
}

runTest();