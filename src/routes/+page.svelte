<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Table } from 'surrealdb';
	import { db } from '$lib/db';
	import { auth, logout } from '$lib/auth.svelte';
	import type { Item, Want } from '$lib/types';
	import { goto } from '$app/navigation';

	let items = $state<Item[]>([]);
	let loading = $state(true);
	let actionLoading = $state<Record<string, boolean>>({});
	let myWantIds = $state<Set<string>>(new Set());
	let killLive: (() => Promise<void>) | undefined;

	// ステータスの日本語表示
	const statusLabel: Record<Item['status'], string> = {
		available: '募集中',
		negotiating: '交渉中',
		transferred: '譲渡済'
	};

	const statusColor: Record<Item['status'], string> = {
		available: 'bg-green-100 text-green-700',
		negotiating: 'bg-yellow-100 text-yellow-700',
		transferred: 'bg-gray-100 text-gray-500'
	};

	// wantのIDからitem ID部分を取得してitemに希望者名を付加する
	async function enrichItemWithRequester(item: Item): Promise<Item> {
		const idPart = String(item.id).split(':')[1];
		const r = await db.query<[Want[]]>(
			'SELECT requester.last_name + requester.first_name AS requester_name FROM want WHERE item = type::thing("item", $id)',
			{ id: idPart }
		);
		return { ...item, requester_name: r[0]?.[0]?.requester_name };
	}

	onMount(async () => {
		// 初期データ: アイテム一覧 + 自分が関わるwant一覧を並行取得
		const [itemResult, wantResult] = await Promise.all([
			db.query<[Item[]]>(`
				SELECT
					*,
					owner.last_name + owner.first_name AS owner_name
				FROM item
				WHERE status != 'transferred'
				ORDER BY created_at DESC
			`),
			db.query<[Want[]]>('SELECT * FROM want')
		]);

		const allWants = wantResult[0] ?? [];
		const wantByItemId = new Map(allWants.map((w) => [String(w.item), w]));

		// アイテムに希望者名を付加
		items = (itemResult[0] ?? []).map((item) => ({
			...item,
			requester_name: wantByItemId.get(String(item.id))?.requester_name
		}));

		// 自分がほしいボタンを押したアイテムのIDセット
		myWantIds = new Set(
			allWants.filter((w) => String(w.requester) === auth.user?.id).map((w) => String(w.item))
		);

		loading = false;

		// Live Query: リアルタイム更新
		const sub = await db.live<Item>(new Table('item'));
		killLive = () => sub.kill();

		(async () => {
			for await (const msg of sub) {
				if (msg.action === 'CREATE') {
					const newItem = msg.value as Item;
					if (newItem.status !== 'transferred') {
						items = [newItem, ...items];
					}
				} else if (msg.action === 'UPDATE') {
					const updated = msg.value as Item;
					if (updated.status === 'transferred') {
						items = items.filter((i) => i.id !== updated.id);
					} else {
						// available に戻ったら myWantIds から除外
						if (updated.status === 'available') {
							const newSet = new Set(myWantIds);
							newSet.delete(String(updated.id));
							myWantIds = newSet;
						}
						// JOINフィールドを補完して更新
						const enriched = await enrichItemWithRequester(updated);
						items = items.map((i) => (i.id === updated.id ? enriched : i));
					}
				} else if (msg.action === 'DELETE') {
					items = items.filter((i) => i.id !== String(msg.recordId));
				}
			}
		})();
	});

	onDestroy(() => {
		killLive?.();
	});

	async function handleLogout() {
		await logout();
		goto('/login');
	}

	// ほしいボタン: wantレコード作成 + status を negotiating に更新
	async function handleWant(itemId: string) {
		const idPart = itemId.split(':')[1];
		actionLoading[itemId] = true;
		try {
			await db.query('INSERT INTO want { item: type::thing("item", $id), requester: $auth.id }', {
				id: idPart
			});
			await db.query(
				"UPDATE type::thing(\"item\", $id) SET status='negotiating', updated_at=time::now()",
				{ id: idPart }
			);
			const newSet = new Set(myWantIds);
			newSet.add(itemId);
			myWantIds = newSet;
		} finally {
			actionLoading[itemId] = false;
		}
	}

	// 譲渡成立: status を transferred に更新（Live Queryが一覧から除外する）
	async function handleTransferred(itemId: string) {
		const idPart = itemId.split(':')[1];
		actionLoading[itemId] = true;
		try {
			await db.query(
				"UPDATE type::thing(\"item\", $id) SET status='transferred', updated_at=time::now()",
				{ id: idPart }
			);
		} finally {
			actionLoading[itemId] = false;
		}
	}

	// 交渉決裂: wantレコード削除 + status を available に戻す
	async function handleNegotiationFailed(itemId: string) {
		const idPart = itemId.split(':')[1];
		actionLoading[itemId] = true;
		try {
			await db.query('DELETE want WHERE item = type::thing("item", $id)', { id: idPart });
			await db.query(
				"UPDATE type::thing(\"item\", $id) SET status='available', updated_at=time::now()",
				{ id: idPart }
			);
		} finally {
			actionLoading[itemId] = false;
		}
	}
</script>

<!-- ヘッダー -->
<header class="border-b bg-white px-4 py-3 shadow-sm">
	<div class="mx-auto flex max-w-2xl items-center justify-between">
		<h1 class="text-lg font-bold text-gray-800">おさがり交換</h1>
		<div class="flex items-center gap-3">
			<span class="text-sm text-gray-500">
				{auth.user?.last_name}{auth.user?.first_name}
			</span>
			<a
				href="/items/new"
				class="rounded bg-blue-500 px-3 py-1 text-sm font-medium text-white hover:bg-blue-600"
			>
				＋ 出品する
			</a>
			<button onclick={handleLogout} class="text-sm text-gray-400 hover:text-gray-600">
				ログアウト
			</button>
		</div>
	</div>
</header>

<!-- 出品一覧 -->
<main class="mx-auto max-w-2xl px-4 py-6">
	{#if loading}
		<p class="text-center text-gray-400">読み込み中...</p>
	{:else if items.length === 0}
		<p class="text-center text-gray-400">出品中のアイテムはありません</p>
	{:else}
		<div class="space-y-4">
			{#each items as item (item.id)}
				<div class="rounded-lg border bg-white p-4 shadow-sm">
					<!-- 画像 -->
					{#if item.images?.length > 0}
						<img
							src={`/api/images/${item.images[0]}`}
							alt={item.title}
							class="mb-3 h-48 w-full rounded object-cover"
						/>
					{/if}

					<!-- タイトルとステータス -->
					<div class="mb-1 flex items-center justify-between">
						<h2 class="font-semibold text-gray-800">{item.title}</h2>
						<span class={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[item.status]}`}>
							{statusLabel[item.status]}
						</span>
					</div>

					<!-- 説明文 -->
					<p class="mb-2 text-sm text-gray-600 line-clamp-2">{item.description}</p>

					<!-- 出品者・編集リンク -->
					<div class="flex items-center justify-between">
						<p class="text-xs text-gray-400">出品者: {item.owner_name ?? ''}</p>
						{#if item.owner === auth.user?.id}
							<a
								href={`/items/${item.id.split(':')[1]}/edit`}
								class="text-xs text-blue-400 hover:underline"
							>編集</a>
						{/if}
					</div>

					<!-- ほしいボタン / ステータス操作 -->
					<div class="mt-3 flex items-center justify-end gap-2">
						{#if item.status === 'available' && item.owner !== auth.user?.id}
							<!-- ほしいボタン（自分が出品していないavailable品） -->
							<button
								onclick={() => handleWant(item.id)}
								disabled={actionLoading[item.id]}
								class="rounded bg-pink-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-pink-600 disabled:opacity-50"
							>
								{actionLoading[item.id] ? '処理中...' : 'ほしい'}
							</button>
						{:else if item.status === 'negotiating' && item.owner === auth.user?.id}
							<!-- 出品者向け: 希望者名 + 交渉決裂 / 譲渡成立 -->
							{#if item.requester_name}
								<span class="text-xs text-gray-400">希望者: {item.requester_name}</span>
							{/if}
							<button
								onclick={() => handleNegotiationFailed(item.id)}
								disabled={actionLoading[item.id]}
								class="rounded border border-gray-300 px-3 py-1 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-50"
							>
								{actionLoading[item.id] ? '処理中...' : '交渉決裂'}
							</button>
							<button
								onclick={() => handleTransferred(item.id)}
								disabled={actionLoading[item.id]}
								class="rounded bg-blue-500 px-3 py-1 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50"
							>
								{actionLoading[item.id] ? '処理中...' : '譲渡成立'}
							</button>
						{:else if item.status === 'negotiating' && myWantIds.has(item.id)}
							<!-- 自分がほしいを押した: 申請済み表示 -->
							<span class="text-xs font-medium text-yellow-600">申請中...</span>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</main>
