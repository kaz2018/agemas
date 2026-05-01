<script lang="ts">
  import { goto } from "$app/navigation";
  import { db } from "$lib/db";
  import { auth } from "$lib/auth.svelte";

  let title = $state("");
  let description = $state("");
  let selectedFiles = $state<File[]>([]);
  let previewUrls = $state<string[]>([]);
  let submitting = $state(false);
  let errorMsg = $state("");
  const canSubmit = $derived(
    title.trim().length > 0 && selectedFiles.length > 0,
  );

  // ファイル選択時にプレビュー生成
  function handleFileChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    selectedFiles = files;
    previewUrls = files.map((f) => URL.createObjectURL(f));
    if (files.length > 0) {
      errorMsg = "";
    }
  }

  // 画像をR2にアップロードしてキーの配列を返す
  async function uploadImages(files: File[]): Promise<string[]> {
    const keys: string[] = [];
    for (const file of files) {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      if (!res.ok) throw new Error("画像のアップロードに失敗しました");
      const { key } = await res.json();
      keys.push(key);
    }
    return keys;
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!title.trim()) {
      errorMsg = "タイトルを入力してください";
      return;
    }
    if (selectedFiles.length === 0) {
      errorMsg = "画像を1枚以上選択してください";
      return;
    }
    submitting = true;
    errorMsg = "";
    try {
      // 画像をR2にアップロード
      const imageKeys = await uploadImages(selectedFiles);

      // SurrealDB にアイテムを登録
      await db.query(
        `
				INSERT INTO item {
					owner: $auth.id,
					title: $title,
					description: $description,
					images: $images,
					status: 'available'
				}
			`,
        {
          title: title.trim(),
          description: description.trim(),
          images: imageKeys,
        },
      );

      goto("/");
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : "出品に失敗しました";
    } finally {
      submitting = false;
    }
  }
</script>

<header class="border-b bg-white px-4 py-3 shadow-sm">
  <div class="mx-auto flex max-w-2xl items-center gap-3">
    <a href="/" class="text-gray-400 hover:text-gray-600">← 戻る</a>
    <h1 class="text-lg font-bold text-gray-800">出品する</h1>
  </div>
</header>

<main class="mx-auto max-w-2xl px-4 py-6">
  <form onsubmit={handleSubmit} class="space-y-5">
    <!-- 画像アップロード -->
    <div>
      <label for="images" class="mb-1 block text-sm font-medium text-gray-700"
        >画像（複数選択可） *</label
      >
      <input
        id="images"
        type="file"
        accept="image/*"
        multiple
        required
        onchange={handleFileChange}
        class="w-full text-sm text-gray-500 file:mr-3 file:rounded file:border-0 file:bg-blue-50 file:px-3 file:py-1 file:text-sm file:text-blue-600"
      />
      {#if previewUrls.length > 0}
        <div class="mt-2 flex gap-2 overflow-x-auto">
          {#each previewUrls as url}
            <img
              src={url}
              alt="プレビュー"
              class="h-20 w-20 rounded object-cover"
            />
          {/each}
        </div>
      {/if}
    </div>

    <!-- タイトル -->
    <div>
      <label for="title" class="mb-1 block text-sm font-medium text-gray-700"
        >タイトル *</label
      >
      <input
        id="title"
        type="text"
        bind:value={title}
        oninput={() => (errorMsg = "")}
        placeholder="例: 80cm 男の子 半袖Tシャツ"
        required
        class="w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
    </div>

    <!-- 説明 -->
    <div>
      <label
        for="description"
        class="mb-1 block text-sm font-medium text-gray-700">説明</label
      >
      <textarea
        id="description"
        bind:value={description}
        rows="4"
        placeholder="サイズ、状態、ブランドなど自由に記入してください"
        class="w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
      ></textarea>
    </div>

    {#if errorMsg}
      <p class="text-sm text-red-500">{errorMsg}</p>
    {/if}

    <button
      type="submit"
      disabled={submitting || !canSubmit}
      class="w-full rounded py-2 font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 bg-blue-500"
    >
      {submitting ? "出品中..." : "出品する"}
    </button>
  </form>
</main>
