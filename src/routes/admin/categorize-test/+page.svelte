<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { auth } from "$lib/auth.svelte";
  import {
    EMPTY_ITEM_CATEGORIES,
    normalizeItemCategories,
    type ItemCategories,
  } from "$lib/itemCategories";

  type SampleCase = {
    id: string;
    label: string;
    title: string;
    description: string;
  };

  const sampleCases: SampleCase[] = [
    {
      id: "toy-pen",
      label: "おもちゃ",
      title: "おもちゃ用ボールペン",
      description:
        "テストです。おもちゃです。ごっこ遊びで使うおもちゃのボールペンです。",
    },
    {
      id: "baby-clothes",
      label: "服",
      title: "80cm 女の子 長袖ロンパース",
      description: "80cmの女の子向けロンパースです。春秋向け。少し毛玉あり。",
    },
    {
      id: "picture-book",
      label: "絵本",
      title: "しかけ絵本 3冊セット",
      description: "3歳ごろから楽しめるしかけ絵本です。記名なし、破れなし。",
    },
    {
      id: "baby-gear",
      label: "育児用品",
      title: "ベビーチェア",
      description:
        "離乳食の時期に使っていたベビーチェアです。1歳から3歳くらいまで使用。",
    },
  ];

  let selectedCaseId = $state(sampleCases[0].id);
  let title = $state(sampleCases[0].title);
  let description = $state(sampleCases[0].description);
  let loading = $state(false);
  let errorMsg = $state("");
  let responseStatus = $state<number | null>(null);
  let responseText = $state("");
  let normalizedCategories = $state<ItemCategories>({
    ...EMPTY_ITEM_CATEGORIES,
  });

  onMount(async () => {
    if (!auth.user) {
      await goto("/login");
      return;
    }

    if (auth.user.role !== "admin") {
      await goto("/");
    }
  });

  function loadSample(sample: SampleCase) {
    selectedCaseId = sample.id;
    title = sample.title;
    description = sample.description;
    errorMsg = "";
  }

  async function handleSubmit(event: Event) {
    event.preventDefault();
    errorMsg = "";
    responseStatus = null;
    responseText = "";
    normalizedCategories = { ...EMPTY_ITEM_CATEGORIES };

    if (!title.trim()) {
      errorMsg = "タイトルを入力してください";
      return;
    }

    loading = true;

    try {
      const response = await fetch("/api/categorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
        }),
      });

      responseStatus = response.status;
      responseText = await response.text();

      try {
        const parsed = JSON.parse(responseText) as Partial<
          Record<keyof ItemCategories, unknown>
        >;
        normalizedCategories = normalizeItemCategories(parsed);
      } catch {
        normalizedCategories = { ...EMPTY_ITEM_CATEGORIES };
      }
    } catch (error) {
      errorMsg =
        error instanceof Error ? error.message : "カテゴリ判定に失敗しました";
    } finally {
      loading = false;
    }
  }
</script>

<header class="border-b bg-white px-4 py-3 shadow-sm">
  <div class="mx-auto flex max-w-4xl items-center gap-3">
    <a href="/admin" class="text-gray-400 hover:text-gray-600"
      >← 管理画面へ戻る</a
    >
    <h1 class="text-lg font-bold text-gray-800">AIカテゴリ診断</h1>
  </div>
</header>

<main class="mx-auto max-w-4xl space-y-6 px-4 py-6">
  <section class="rounded-xl border bg-white p-4 shadow-sm">
    <h2 class="text-base font-bold text-gray-700">サンプルデータ</h2>
    <p class="mt-1 text-sm text-gray-500">
      出品フォームと同じく、タイトルと説明を <code>/api/categorize</code> に送って結果を確認します。
    </p>
    <div class="mt-4 flex flex-wrap gap-2">
      {#each sampleCases as sample (sample.id)}
        <button
          type="button"
          onclick={() => loadSample(sample)}
          class={`rounded-full px-3 py-1 text-sm ${
            selectedCaseId === sample.id
              ? "bg-blue-500 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          {sample.label}
        </button>
      {/each}
    </div>
  </section>

  <section class="rounded-xl border bg-white p-4 shadow-sm">
    <form onsubmit={handleSubmit} class="space-y-4">
      <div>
        <label
          for="sample-title"
          class="mb-1 block text-sm font-medium text-gray-700">タイトル</label
        >
        <input
          id="sample-title"
          type="text"
          bind:value={title}
          class="w-full rounded border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-400 focus:outline-none"
        />
      </div>

      <div>
        <label
          for="sample-description"
          class="mb-1 block text-sm font-medium text-gray-700">説明</label
        >
        <textarea
          id="sample-description"
          bind:value={description}
          rows="5"
          class="w-full rounded border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-400 focus:outline-none"
        ></textarea>
      </div>

      {#if errorMsg}
        <p class="text-sm text-red-500">{errorMsg}</p>
      {/if}

      <button
        type="submit"
        disabled={loading}
        class="rounded bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
      >
        {loading ? "判定中..." : "カテゴリ判定を実行"}
      </button>
    </form>
  </section>

  <section class="grid gap-6 lg:grid-cols-2">
    <div class="rounded-xl border bg-white p-4 shadow-sm">
      <h2 class="text-base font-bold text-gray-700">正規化後のカテゴリ</h2>
      <div class="mt-4 space-y-2 text-sm">
        <p>
          <span class="font-medium">HTTP Status:</span>
          {responseStatus ?? "-"}
        </p>
        <p>
          <span class="font-medium">category_type:</span>
          {normalizedCategories.category_type ?? "null"}
        </p>
        <p>
          <span class="font-medium">category_age:</span>
          {normalizedCategories.category_age ?? "null"}
        </p>
        <p>
          <span class="font-medium">category_gender:</span>
          {normalizedCategories.category_gender ?? "null"}
        </p>
        <p>
          <span class="font-medium">category_size:</span>
          {normalizedCategories.category_size ?? "null"}
        </p>
      </div>
    </div>

    <div class="rounded-xl border bg-white p-4 shadow-sm">
      <h2 class="text-base font-bold text-gray-700">APIレスポンス本文</h2>
      <pre
        class="mt-4 overflow-x-auto rounded bg-gray-50 p-3 text-xs text-gray-700">{responseText ||
          "(未実行)"}</pre>
    </div>
  </section>
</main>
