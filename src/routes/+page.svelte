<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Table } from 'surrealdb';
	import { db } from '$lib/db';
	import { auth, logout } from '$lib/auth.svelte';
	import type { Item } from '$lib/types';
	import { goto } from '$app/navigation';

	let items = $state<Item[]>([]);
	let loading = $state(true);
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

	onMount(async () => {
		// 初期データ取得（出品者名も一緒に取得）
		const result = await db.query<[Item[]]>(`
			SELECT
				*,
				owner.last_name + owner.first_name AS owner_name
			FROM item
			WHERE status != 'transferred'
			ORDER BY created_at DESC
		`);
		items = result[0] ?? [];
		loading = false;

		// Live Query: リアルタイム更新
		// LiveResource には Table クラスが必要
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
						items = items.map((i) => (i.id === updated.id ? updated : i));
					}
				} else if (msg.action === 'DELETE') {
					items = items.filter((i) => i.id !== String(msg.recordId));
				}
			}
		})();
	});

	// コンポーネント破棄時にLive購読を終了
	onDestroy(() => {
		killLive?.();
	});

	async function handleLogout() {
		await logout();
		goto('/login');
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
				</div>
			{/each}
		</div>
	{/if}
</main>
