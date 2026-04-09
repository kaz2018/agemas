export type Item = {
	id: string;
	owner: string; // record<user> の文字列表現
	title: string;
	description: string;
	images: string[]; // R2のキー
	status: 'available' | 'negotiating' | 'transferred';
	created_at: string;
	updated_at: string;
	// JOINして取得する出品者情報
	owner_name?: string;
};

export type Want = {
	id: string;
	item: string;
	requester: string;
	created_at: string;
};
