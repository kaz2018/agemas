import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';

// 許可する画像のMIMEタイプ
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
// 最大ファイルサイズ: 5MB
const MAX_SIZE = 5 * 1024 * 1024;

export const POST: RequestHandler = async ({ request, platform }) => {
	const bucket = platform?.env?.IMAGES;
	if (!bucket) {
		error(500, 'R2 binding not available');
	}

	const formData = await request.formData();
	const file = formData.get('file') as File | null;

	if (!file) {
		error(400, 'ファイルが指定されていません');
	}
	if (!ALLOWED_TYPES.includes(file.type)) {
		error(400, '対応していないファイル形式です');
	}
	if (file.size > MAX_SIZE) {
		error(400, 'ファイルサイズは5MB以下にしてください');
	}

	// ファイル名: タイムスタンプ + ランダム文字列 + 拡張子
	const ext = file.name.split('.').pop();
	const key = `${Date.now()}-${crypto.randomUUID()}.${ext}`;

	await bucket.put(key, await file.arrayBuffer(), {
		httpMetadata: { contentType: file.type }
	});

	return json({ key, url: `/api/images/${key}` });
};
