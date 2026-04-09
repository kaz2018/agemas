<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { db } from '$lib/db';
	import { auth } from '$lib/auth.svelte';
	import type { Item } from '$lib/types';

	const itemId = $derived($page.params.id);

	let title = $state('');
	let description = $state('');
	let existingImages = $state<string[]>([]); // 既存のR2キー
	let newFiles = $state<File[]>([]);
	let newPreviewUrls = $state<string[]>([]);
	let submitting = $state(false);
	let deleting = $state(false);
	let errorMsg = $state('');
	let notFound = $state(false);

	onMount(async () => {
		const result = await db.query<[Item[]]>(
			'SELECT * FROM type::thing("item", $id)',
			{ id: itemId }
		);
		const item = result[0]?.[0];

		if (!item) {
			notFound = true;
			return;
		}
		// 本人チェック（権限はSurrealDB側でも保証されるが、UIでも確認）
		if (item.owner !== auth.user?.id) {
			goto('/');
			return;
		}
		title = item.title;
		description = item.description;
		existingImages = item.images ?? [];
	});

	function handleFileChange(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const files = Array.from(input.files ?? []);
		newFiles = files;
		newPreviewUrls = files.map((f) => URL.createObjectURL(f));
	}

	// 既存画像を削除リストから除外
	function removeExistingImage(key: string) {
		existingImages = existingImages.filter((k) => k !== key);
	}

	async function uploadImages(files: File[]): Promise<string[]> {
		const keys: string[] = [];
		for (const file of files) {
			const form = new FormData();
			form.append('file', file);
			const res = await fetch('/api/upload', { method: 'POST', body: form });
			if (!res.ok) throw new Error('画像のアップロードに失敗しました');
			const { key } = await res.json();
			keys.push(key);
		}
		return keys;
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!title.trim()) {
			errorMsg = 'タイトルを入力してください';
			return;
		}
		submitting = true;
		errorMsg = '';
		try {
			const newKeys = await uploadImages(newFiles);
			const images = [...existingImages, ...newKeys];

			await db.query(
				`UPDATE type::thing("item", $id)
				 SET title=$title, description=$description, images=$images, updated_at=time::now()`,
				{ id: itemId, title: title.trim(), description: description.trim(), images }
			);
			goto('/');
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : '更新に失敗しました';
		} finally {
			submitting = false;
		}
	}

	async function handleDelete() {
		if (!confirm('この出品を削除しますか？')) return;
		deleting = true;
		try {
			await db.query(
				'DELETE type::thing("item", $id)',
				{ id: itemId }
			);
			goto('/');
		} catch {
			errorMsg = '削除に失敗しました';
			deleting = false;
		}
	}
</script>

<header class="border-b bg-white px-4 py-3 shadow-sm">
	<div class="mx-auto flex max-w-2xl items-center gap-3">
		<a href="/" class="text-gray-400 hover:text-gray-600">← 戻る</a>
		<h1 class="text-lg font-bold text-gray-800">出品を編集</h1>
	</div>
</header>

<main class="mx-auto max-w-2xl px-4 py-6">
	{#if notFound}
		<p class="text-center text-gray-400">出品が見つかりません</p>
	{:else}
		<form onsubmit={handleSubmit} class="space-y-5">
			<!-- 既存画像 -->
			{#if existingImages.length > 0}
				<div>
					<p class="mb-1 text-sm font-medium text-gray-700">現在の画像</p>
					<div class="flex flex-wrap gap-2">
						{#each existingImages as key}
							<div class="relative">
								<img
									src={`/api/images/${key}`}
									alt="既存画像"
									class="h-20 w-20 rounded object-cover"
								/>
								<button
									type="button"
									onclick={() => removeExistingImage(key)}
									class="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white"
								>×</button>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- 新規画像追加 -->
			<div>
				<label for="newImages" class="mb-1 block text-sm font-medium text-gray-700">画像を追加</label>
				<input
					id="newImages"
					type="file"
					accept="image/*"
					multiple
					onchange={handleFileChange}
					class="w-full text-sm text-gray-500 file:mr-3 file:rounded file:border-0 file:bg-blue-50 file:px-3 file:py-1 file:text-sm file:text-blue-600"
				/>
				{#if newPreviewUrls.length > 0}
					<div class="mt-2 flex gap-2">
						{#each newPreviewUrls as url}
							<img src={url} alt="プレビュー" class="h-20 w-20 rounded object-cover" />
						{/each}
					</div>
				{/if}
			</div>

			<!-- タイトル -->
			<div>
				<label for="title" class="mb-1 block text-sm font-medium text-gray-700">タイトル *</label>
				<input
					id="title"
					type="text"
					bind:value={title}
					required
					class="w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
				/>
			</div>

			<!-- 説明 -->
			<div>
				<label for="description" class="mb-1 block text-sm font-medium text-gray-700">説明</label>
				<textarea
					id="description"
					bind:value={description}
					rows="4"
					class="w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
				></textarea>
			</div>

			{#if errorMsg}
				<p class="text-sm text-red-500">{errorMsg}</p>
			{/if}

			<button
				type="submit"
				disabled={submitting}
				class="w-full rounded bg-blue-500 py-2 font-medium text-white hover:bg-blue-600 disabled:opacity-50"
			>
				{submitting ? '更新中...' : '更新する'}
			</button>

			<!-- 削除ボタン -->
			<button
				type="button"
				onclick={handleDelete}
				disabled={deleting}
				class="w-full rounded border border-red-300 py-2 text-sm font-medium text-red-500 hover:bg-red-50 disabled:opacity-50"
			>
				{deleting ? '削除中...' : 'この出品を削除する'}
			</button>
		</form>
	{/if}
</main>
