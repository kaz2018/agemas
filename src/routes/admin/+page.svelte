<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { db } from '$lib/db';
	import { auth } from '$lib/auth.svelte';
	import type { AuthUser } from '$lib/auth.svelte';

	type AdminUser = AuthUser & { id: string };

	let users = $state<AdminUser[]>([]);
	let loading = $state(true);
	let errorMsg = $state('');

	// 新規ユーザー作成フォーム
	let newUserId = $state('');
	let newLastName = $state('');
	let newFirstName = $state('');
	let newPassword = $state('');
	let newRole = $state<'user' | 'admin'>('user');
	let creating = $state(false);
	let createError = $state('');

	// 編集中のユーザー
	let editingId = $state<string | null>(null);
	let editLastName = $state('');
	let editFirstName = $state('');
	let editPassword = $state(''); // 空なら変更しない
	let editRole = $state<'user' | 'admin'>('user');
	let saving = $state(false);
	let editError = $state('');

	onMount(async () => {
		// 管理者以外はトップへリダイレクト
		if (!auth.loading && auth.user?.role !== 'admin') {
			goto('/');
			return;
		}
		await loadUsers();
	});

	async function loadUsers() {
		loading = true;
		errorMsg = '';
		try {
			const result = await db.query<[AdminUser[]]>(
				'SELECT * FROM user ORDER BY user_id ASC'
			);
			users = result[0] ?? [];
		} catch {
			errorMsg = 'ユーザー一覧の取得に失敗しました';
		} finally {
			loading = false;
		}
	}

	async function handleCreate(e: Event) {
		e.preventDefault();
		createError = '';
		if (!newUserId || !newLastName || !newFirstName || !newPassword) {
			createError = '全項目を入力してください';
			return;
		}
		if (!/^\d{3}$/.test(newUserId)) {
			createError = 'IDは3桁の数字で入力してください（例: 001）';
			return;
		}
		if (newPassword.length !== 4 || !/^\d{4}$/.test(newPassword)) {
			createError = 'PINは4桁の数字で入力してください';
			return;
		}
		creating = true;
		try {
			await db.query(
				`INSERT INTO user {
					user_id: $user_id,
					last_name: $last_name,
					first_name: $first_name,
					password: crypto::argon2::generate($password),
					role: $role
				}`,
				{
					user_id: newUserId,
					last_name: newLastName.trim(),
					first_name: newFirstName.trim(),
					password: newPassword,
					role: newRole
				}
			);
			// フォームをリセット
			newUserId = '';
			newLastName = '';
			newFirstName = '';
			newPassword = '';
			newRole = 'user';
			await loadUsers();
		} catch (err) {
			createError = err instanceof Error ? err.message : 'ユーザーの作成に失敗しました';
		} finally {
			creating = false;
		}
	}

	function startEdit(user: AdminUser) {
		editingId = user.id;
		editLastName = user.last_name;
		editFirstName = user.first_name;
		editPassword = '';
		editRole = user.role;
		editError = '';
	}

	function cancelEdit() {
		editingId = null;
		editError = '';
	}

	async function handleSave(userId: string) {
		editError = '';
		if (!editLastName.trim() || !editFirstName.trim()) {
			editError = '姓・名を入力してください';
			return;
		}
		if (editPassword && (editPassword.length !== 4 || !/^\d{4}$/.test(editPassword))) {
			editError = 'PINは4桁の数字で入力してください';
			return;
		}
		saving = true;
		try {
			const idPart = userId.split(':')[1];
			if (editPassword) {
				await db.query(
					`UPDATE type::thing("user", $id) SET
						last_name=$last_name, first_name=$first_name,
						password=crypto::argon2::generate($password), role=$role`,
					{ id: idPart, last_name: editLastName.trim(), first_name: editFirstName.trim(), password: editPassword, role: editRole }
				);
			} else {
				await db.query(
					`UPDATE type::thing("user", $id) SET
						last_name=$last_name, first_name=$first_name, role=$role`,
					{ id: idPart, last_name: editLastName.trim(), first_name: editFirstName.trim(), role: editRole }
				);
			}
			editingId = null;
			await loadUsers();
		} catch (err) {
			editError = err instanceof Error ? err.message : '更新に失敗しました';
		} finally {
			saving = false;
		}
	}

	async function handleDelete(userId: string, displayName: string) {
		if (!confirm(`${displayName} を削除しますか？`)) return;
		try {
			const idPart = userId.split(':')[1];
			await db.query('DELETE type::thing("user", $id)', { id: idPart });
			await loadUsers();
		} catch {
			errorMsg = '削除に失敗しました';
		}
	}
</script>

<header class="border-b bg-white px-4 py-3 shadow-sm">
	<div class="mx-auto flex max-w-2xl items-center gap-3">
		<a href="/" class="text-gray-400 hover:text-gray-600">← 戻る</a>
		<h1 class="text-lg font-bold text-gray-800">管理者画面</h1>
	</div>
</header>

<main class="mx-auto max-w-2xl px-4 py-6 space-y-8">

	<!-- ユーザー一覧 -->
	<section>
		<h2 class="mb-3 text-base font-bold text-gray-700">ユーザー一覧</h2>

		{#if loading}
			<p class="text-sm text-gray-400">読み込み中...</p>
		{:else if errorMsg}
			<p class="text-sm text-red-500">{errorMsg}</p>
		{:else if users.length === 0}
			<p class="text-sm text-gray-400">ユーザーが登録されていません</p>
		{:else}
			<div class="space-y-3">
				{#each users as user (user.id)}
					<div class="rounded-lg border bg-white p-4">
						{#if editingId === user.id}
							<!-- 編集フォーム（インライン） -->
							<div class="space-y-3">
								<div class="flex gap-2">
									<div class="flex-1">
										<label for={`edit-last-${user.id}`} class="mb-0.5 block text-xs text-gray-500">姓</label>
										<input
											id={`edit-last-${user.id}`}
											type="text"
											bind:value={editLastName}
											class="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
										/>
									</div>
									<div class="flex-1">
										<label for={`edit-first-${user.id}`} class="mb-0.5 block text-xs text-gray-500">名</label>
										<input
											id={`edit-first-${user.id}`}
											type="text"
											bind:value={editFirstName}
											class="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
										/>
									</div>
								</div>
								<div class="flex gap-2">
									<div class="flex-1">
										<label for={`edit-pin-${user.id}`} class="mb-0.5 block text-xs text-gray-500">PIN（変更する場合のみ）</label>
										<input
											id={`edit-pin-${user.id}`}
											type="text"
											inputmode="numeric"
											maxlength={4}
											bind:value={editPassword}
											placeholder="4桁"
											class="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
										/>
									</div>
									<div class="flex-1">
										<label for={`edit-role-${user.id}`} class="mb-0.5 block text-xs text-gray-500">ロール</label>
										<select
											id={`edit-role-${user.id}`}
											bind:value={editRole}
											class="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
										>
											<option value="user">一般</option>
											<option value="admin">管理者</option>
										</select>
									</div>
								</div>
								{#if editError}
									<p class="text-xs text-red-500">{editError}</p>
								{/if}
								<div class="flex gap-2">
									<button
										onclick={() => handleSave(user.id)}
										disabled={saving}
										class="rounded bg-blue-500 px-3 py-1 text-sm text-white hover:bg-blue-600 disabled:opacity-50"
									>
										{saving ? '保存中...' : '保存'}
									</button>
									<button
										onclick={cancelEdit}
										class="rounded border border-gray-300 px-3 py-1 text-sm text-gray-500 hover:bg-gray-50"
									>
										キャンセル
									</button>
								</div>
							</div>
						{:else}
							<!-- 表示 -->
							<div class="flex items-center justify-between">
								<div>
									<span class="font-medium text-gray-800">
										{user.user_id}. {user.last_name}{user.first_name}
									</span>
									<span class={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>
										{user.role === 'admin' ? '管理者' : '一般'}
									</span>
								</div>
								<div class="flex gap-2">
									<button
										onclick={() => startEdit(user)}
										class="text-xs text-blue-400 hover:underline"
									>編集</button>
									{#if user.id !== auth.user?.id}
										<button
											onclick={() => handleDelete(user.id, `${user.last_name}${user.first_name}`)}
											class="text-xs text-red-400 hover:underline"
										>削除</button>
									{/if}
								</div>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<!-- ユーザー作成フォーム -->
	<section>
		<h2 class="mb-3 text-base font-bold text-gray-700">ユーザーを追加</h2>
		<form onsubmit={handleCreate} class="rounded-lg border bg-white p-4 space-y-3">
			<div class="flex gap-2">
				<div class="w-24">
					<label for="new-user-id" class="mb-0.5 block text-xs text-gray-500">番号（3桁）*</label>
					<input
						id="new-user-id"
						type="text"
						inputmode="numeric"
						maxlength={3}
						bind:value={newUserId}
						placeholder="001"
						required
						class="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
					/>
				</div>
				<div class="flex-1">
					<label for="new-last-name" class="mb-0.5 block text-xs text-gray-500">姓 *</label>
					<input
						id="new-last-name"
						type="text"
						bind:value={newLastName}
						placeholder="やまだ"
						required
						class="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
					/>
				</div>
				<div class="flex-1">
					<label for="new-first-name" class="mb-0.5 block text-xs text-gray-500">名 *</label>
					<input
						id="new-first-name"
						type="text"
						bind:value={newFirstName}
						placeholder="たろう"
						required
						class="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
					/>
				</div>
			</div>
			<div class="flex gap-2">
				<div class="w-32">
					<label for="new-password" class="mb-0.5 block text-xs text-gray-500">PIN（4桁）*</label>
					<input
						id="new-password"
						type="text"
						inputmode="numeric"
						maxlength={4}
						bind:value={newPassword}
						placeholder="1234"
						required
						class="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
					/>
				</div>
				<div class="flex-1">
					<label for="new-role" class="mb-0.5 block text-xs text-gray-500">ロール</label>
					<select
						id="new-role"
						bind:value={newRole}
						class="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
					>
						<option value="user">一般</option>
						<option value="admin">管理者</option>
					</select>
				</div>
			</div>
			{#if createError}
				<p class="text-xs text-red-500">{createError}</p>
			{/if}
			<button
				type="submit"
				disabled={creating}
				class="w-full rounded bg-green-500 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50"
			>
				{creating ? '作成中...' : 'ユーザーを作成'}
			</button>
		</form>
	</section>

</main>
