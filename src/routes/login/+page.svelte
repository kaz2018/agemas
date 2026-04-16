<script lang="ts">
	import { goto } from '$app/navigation';
	import { login, auth } from '$lib/auth.svelte';
	import { checkRateLimit, recordFailure, recordSuccess } from '$lib/rateLimit';

	let userId = $state('');
	let password = $state('');
	let errorMsg = $state('');
	let loading = $state(false);

	// すでにログイン済みならトップへ
	$effect(() => {
		if (auth.user) goto('/');
	});

	async function handleSubmit(e: Event) {
		e.preventDefault();
		errorMsg = '';

		// 3桁数字バリデーション（例: "001"）
		if (!/^\d{3}$/.test(userId)) {
			errorMsg = 'IDは3桁の数字で入力してください（例: 001）';
			return;
		}
		if (!/^\d{4}$/.test(password)) {
			errorMsg = 'PINは4桁の数字で入力してください';
			return;
		}

		// レート制限チェック
		const { allowed, remainingMs } = checkRateLimit(userId);
		if (!allowed) {
			const minutes = Math.ceil((remainingMs ?? 0) / 60000);
			errorMsg = `ログイン試行が多すぎます。${minutes}分後に再試行してください`;
			return;
		}

		loading = true;
		try {
			await login(userId, password);
			recordSuccess(userId);
			goto('/');
		} catch {
			recordFailure(userId);
			errorMsg = 'IDまたはPINが正しくありません';
		} finally {
			loading = false;
		}
	}
</script>

<div class="flex min-h-screen items-center justify-center bg-gray-50">
	<div class="w-full max-w-sm rounded-lg bg-white p-8 shadow">
		<h1 class="mb-6 text-center text-xl font-bold text-gray-800">おさがり交換</h1>

		<form onsubmit={handleSubmit} class="space-y-4">
			<div>
				<label for="userId" class="mb-1 block text-sm font-medium text-gray-700">ID（3桁）</label>
				<input
					id="userId"
					type="text"
					inputmode="numeric"
					maxlength={3}
					bind:value={userId}
					placeholder="例: 001"
					required
					class="w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
				/>
			</div>

			<div>
				<label for="password" class="mb-1 block text-sm font-medium text-gray-700">PIN（4桁）</label>
				<input
					id="password"
					type="password"
					bind:value={password}
					placeholder="****"
					maxlength="4"
					inputmode="numeric"
					required
					class="w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
				/>
			</div>

			{#if errorMsg}
				<p class="text-sm text-red-500">{errorMsg}</p>
			{/if}

			<button
				type="submit"
				disabled={loading}
				class="w-full rounded bg-blue-500 py-2 font-medium text-white hover:bg-blue-600 disabled:opacity-50"
			>
				{loading ? 'ログイン中...' : 'ログイン'}
			</button>
		</form>
	</div>
</div>
