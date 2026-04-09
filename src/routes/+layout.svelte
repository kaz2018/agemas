<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { auth, initAuth } from '$lib/auth.svelte';

	let { children } = $props();

	// アプリ起動時にセッションを復元
	onMount(() => {
		initAuth();
	});

	// 未ログインかつ /login 以外のページならリダイレクト
	$effect(() => {
		if (!auth.loading && !auth.user && $page.url.pathname !== '/login') {
			goto('/login');
		}
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

{#if auth.loading}
	<!-- セッション復元中はローディング表示 -->
	<div class="flex min-h-screen items-center justify-center text-gray-400">読み込み中...</div>
{:else}
	{@render children()}
{/if}
