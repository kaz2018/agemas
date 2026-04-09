import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';

// 画像を取得する
export const GET: RequestHandler = async ({ params, platform }) => {
	const bucket = platform?.env?.IMAGES;
	if (!bucket) {
		error(500, 'R2 binding not available');
	}

	const object = await bucket.get(params.key);
	if (!object) {
		error(404, '画像が見つかりません');
	}

	return new Response(object.body, {
		headers: {
			'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
			'Cache-Control': 'public, max-age=31536000' // 1年キャッシュ
		}
	});
};

// 画像を削除する（出品者本人のみ呼び出す想定）
export const DELETE: RequestHandler = async ({ params, platform }) => {
	const bucket = platform?.env?.IMAGES;
	if (!bucket) {
		error(500, 'R2 binding not available');
	}

	await bucket.delete(params.key);
	return new Response(null, { status: 204 });
};
