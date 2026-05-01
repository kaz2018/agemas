<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Table } from "surrealdb";
  import { db } from "$lib/db";
  import { auth, logout } from "$lib/auth.svelte";
  import type { Item, Want } from "$lib/types";
  import { goto } from "$app/navigation";

  let items = $state<Item[]>([]);
  let loading = $state(true);
  let errorMsg = $state("");
  let actionLoading = $state<Record<string, boolean>>({});
  let myWantIds = $state<Set<string>>(new Set());
  let killLive: (() => Promise<void>) | undefined;

  // ステータスの日本語表示
  const statusLabel: Record<Item["status"], string> = {
    available: "募集中",
    negotiating: "交渉中",
    transferred: "譲渡済",
  };

  const statusColor: Record<Item["status"], string> = {
    available: "bg-green-100 text-green-700",
    negotiating: "bg-yellow-100 text-yellow-700",
    transferred: "bg-gray-100 text-gray-500",
  };

  const buyerContactMessage =
    "次はご自分のLINEやメールなどで出品者とやりとりしてください。";
  const buyerResolutionMessage =
    "お話がまとまりましたら、出品者側で「あげる」または「キャンセル」を押して結果が反映されます。";
  const sellerContactMessage = "次はLINEやメールなどでやりとりしてください。";
  const sellerResolutionMessage =
    "譲ることが決まったら「あげる」、見送る場合は「キャンセル」を押してください。";

  function recordId(value: unknown) {
    return String(value);
  }

  function currentUserId() {
    return auth.user ? recordId(auth.user.id) : null;
  }

  function isOwnedByCurrentUser(item: Item) {
    return recordId(item.owner) === currentUserId();
  }

  function getErrorMessage(err: unknown, fallback: string) {
    return err instanceof Error ? `${fallback}: ${err.message}` : fallback;
  }

  function isDuplicateWantError(err: unknown) {
    return (
      err instanceof Error &&
      err.message.includes("want_item_requester") &&
      err.message.includes("already contains")
    );
  }

  // wantから希望者ID/名前を取得してitemに付加する
  async function enrichItemWithRequester(item: Item): Promise<Item> {
    const r = await db.query<[Want[]]>(
      "SELECT requester.user_id AS requester_user_id, requester.last_name + requester.first_name AS requester_name FROM want WHERE item = type::record($itemId)",
      { itemId: recordId(item.id) },
    );
    return {
      ...item,
      requester_user_id: r[0]?.[0]?.requester_user_id,
      requester_name: r[0]?.[0]?.requester_name,
    };
  }

  onMount(async () => {
    errorMsg = "";

    try {
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
        db.query<[Want[]]>(`
					SELECT
						*,
						requester.user_id AS requester_user_id,
						requester.last_name + requester.first_name AS requester_name
					FROM want
				`),
      ]);

      const allWants = wantResult[0] ?? [];
      const wantByItemId = new Map(allWants.map((w) => [recordId(w.item), w]));

      // アイテムに希望者名を付加
      items = (itemResult[0] ?? []).map((item) => ({
        ...item,
        requester_user_id: wantByItemId.get(recordId(item.id))
          ?.requester_user_id,
        requester_name: wantByItemId.get(recordId(item.id))?.requester_name,
      }));

      // 自分がほしいボタンを押したアイテムのIDセット
      myWantIds = new Set(
        allWants
          .filter((w) => recordId(w.requester) === currentUserId())
          .map((w) => recordId(w.item)),
      );
    } catch (err) {
      errorMsg =
        err instanceof Error
          ? `一覧の取得に失敗しました: ${err.message}`
          : "一覧の取得に失敗しました";
      items = [];
      myWantIds = new Set();
      return;
    } finally {
      loading = false;
    }

    try {
      // Live Query: リアルタイム更新
      const sub = await db.live<Item>(new Table("item"));
      killLive = () => sub.kill();

      (async () => {
        for await (const msg of sub) {
          if (msg.action === "CREATE") {
            const newItem = msg.value as Item;
            if (newItem.status !== "transferred") {
              items = [newItem, ...items];
            }
          } else if (msg.action === "UPDATE") {
            const updated = msg.value as Item;
            if (updated.status === "transferred") {
              items = items.filter(
                (i) => recordId(i.id) !== recordId(updated.id),
              );
            } else {
              // available に戻ったら myWantIds から除外
              if (updated.status === "available") {
                const newSet = new Set(myWantIds);
                newSet.delete(recordId(updated.id));
                myWantIds = newSet;
              }
              // JOINフィールドを補完して更新
              const enriched = await enrichItemWithRequester(updated);
              items = items.map((i) =>
                recordId(i.id) === recordId(updated.id) ? enriched : i,
              );
            }
          } else if (msg.action === "DELETE") {
            items = items.filter(
              (i) => recordId(i.id) !== recordId(msg.recordId),
            );
          }
        }
      })();
    } catch (err) {
      errorMsg =
        err instanceof Error
          ? `一覧は表示していますが、リアルタイム更新を開始できませんでした: ${err.message}`
          : "一覧は表示していますが、リアルタイム更新を開始できませんでした";
    }
  });

  onDestroy(() => {
    killLive?.();
  });

  async function handleLogout() {
    await logout();
    goto("/login");
  }

  // ほしいボタン: wantレコード作成（status更新はDBイベントに委譲）
  async function handleWant(itemId: string) {
    actionLoading[itemId] = true;
    errorMsg = "";
    try {
      await db.query(
        "INSERT INTO want { item: type::record($itemId), requester: $auth.id }",
        {
          itemId,
        },
      );
      const newSet = new Set(myWantIds);
      newSet.add(itemId);
      myWantIds = newSet;
    } catch (err) {
      if (isDuplicateWantError(err)) {
        const newSet = new Set(myWantIds);
        newSet.add(itemId);
        myWantIds = newSet;
        errorMsg = "すでに申請中です";
      } else {
        errorMsg = getErrorMessage(err, "申請に失敗しました");
      }
    } finally {
      actionLoading[itemId] = false;
    }
  }

  // 譲渡成立: status を transferred に更新（Live Queryが一覧から除外する）
  async function handleTransferred(itemId: string) {
    actionLoading[itemId] = true;
    errorMsg = "";
    try {
      await db.query(
        "UPDATE type::record($itemId) SET status='transferred', updated_at=time::now()",
        {
          itemId,
        },
      );
    } catch (err) {
      errorMsg = getErrorMessage(err, "譲渡成立の更新に失敗しました");
    } finally {
      actionLoading[itemId] = false;
    }
  }

  // 交渉決裂: wantレコード削除（status更新はDBイベントに委譲）
  async function handleNegotiationFailed(itemId: string) {
    actionLoading[itemId] = true;
    errorMsg = "";
    try {
      await db.query("DELETE want WHERE item = type::record($itemId)", {
        itemId,
      });
    } catch (err) {
      errorMsg = getErrorMessage(err, "交渉決裂の更新に失敗しました");
    } finally {
      actionLoading[itemId] = false;
    }
  }
</script>

<!-- ヘッダー -->
<header class="border-b bg-white px-4 py-3 shadow-sm">
  <div
    class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3"
  >
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
      {#if auth.user?.role === "admin"}
        <a href="/admin" class="text-sm text-gray-400 hover:text-gray-600"
          >管理</a
        >
      {/if}
      <button
        onclick={handleLogout}
        class="text-sm text-gray-400 hover:text-gray-600"
      >
        ログアウト
      </button>
    </div>
  </div>
</header>

<!-- 出品一覧 -->
<main class="mx-auto max-w-6xl px-4 py-6">
  {#if loading}
    <p class="text-center text-gray-400">読み込み中...</p>
  {:else if errorMsg}
    <p class="text-center text-sm text-red-500">{errorMsg}</p>
  {:else if items.length === 0}
    <p class="text-center text-gray-400">出品中のアイテムはありません</p>
  {:else}
    <div class="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {#each items as item (item.id)}
        <article
          class="flex h-full flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm"
        >
          <div class="relative aspect-[3/4] w-full bg-gray-50">
            <span
              class={`absolute top-3 right-3 z-10 rounded-full px-2.5 py-1 text-xs font-medium shadow-sm ${statusColor[item.status]}`}
            >
              {statusLabel[item.status]}
            </span>

            {#if item.images?.length > 0}
              <img
                src={`/api/images/${item.images[0]}`}
                alt={item.title}
                class="h-full w-full object-contain p-3"
              />
            {:else}
              <div
                class="flex h-full items-center justify-center text-sm text-gray-400"
              >
                画像なし
              </div>
            {/if}
          </div>

          <div class="flex flex-1 flex-col gap-3 p-4">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <h2 class="text-base font-semibold text-gray-800">
                  {item.title}
                </h2>
                <p class="mt-1 line-clamp-3 text-sm text-gray-600">
                  {item.description}
                </p>
              </div>
              {#if isOwnedByCurrentUser(item)}
                <a
                  href={`/items/${recordId(item.id).split(":")[1]}/edit`}
                  class="shrink-0 text-xs font-medium text-blue-500 hover:underline"
                  >編集</a
                >
              {/if}
            </div>

            <div class="space-y-2 text-xs text-gray-400">
              <p>出品者: {item.owner_name ?? ""}</p>
              {#if item.status === "negotiating" && isOwnedByCurrentUser(item) && (item.requester_user_id || item.requester_name)}
                <div
                  class="space-y-1 rounded-2xl bg-yellow-50 px-3 py-2 text-yellow-800"
                >
                  <p class="font-medium">
                    {#if item.requester_user_id || item.requester_name}
                      {#if item.requester_user_id}{item.requester_user_id}{/if}
                      {#if item.requester_name}
                        {item.requester_user_id
                          ? `（${item.requester_name}）`
                          : item.requester_name}
                      {/if}
                    {/if}
                    さんがほしい申請中です。
                  </p>
                  <p>{sellerContactMessage}</p>
                  <p>{sellerResolutionMessage}</p>
                </div>
              {/if}
            </div>

            <div class="mt-auto">
              <!-- ほしいボタン / ステータス操作 -->
              <div class="flex flex-col gap-2">
                {#if !isOwnedByCurrentUser(item) && myWantIds.has(recordId(item.id))}
                  <div
                    class="rounded-2xl bg-yellow-50 px-4 py-3 text-sm text-yellow-800"
                  >
                    <p class="font-medium">ほしい申請しました。</p>
                    <p class="mt-1">{buyerContactMessage}</p>
                    <p class="mt-1">{buyerResolutionMessage}</p>
                  </div>
                {:else if item.status === "available" && !isOwnedByCurrentUser(item)}
                  <!-- ほしいボタン（自分が出品していないavailable品） -->
                  <button
                    onclick={() => handleWant(recordId(item.id))}
                    disabled={actionLoading[recordId(item.id)]}
                    class="w-full rounded-xl bg-pink-500 px-4 py-2 text-sm font-medium text-white hover:bg-pink-600 disabled:opacity-50"
                  >
                    {actionLoading[recordId(item.id)] ? "処理中..." : "ほしい"}
                  </button>
                {:else if item.status === "negotiating" && isOwnedByCurrentUser(item)}
                  <!-- 出品者向け: キャンセル / あげる -->
                  <div class="grid grid-cols-2 gap-2">
                    <button
                      onclick={() => handleNegotiationFailed(recordId(item.id))}
                      disabled={actionLoading[recordId(item.id)]}
                      class="rounded-xl border border-gray-300 px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {actionLoading[recordId(item.id)]
                        ? "処理中..."
                        : "キャンセル"}
                    </button>
                    <button
                      onclick={() => handleTransferred(recordId(item.id))}
                      disabled={actionLoading[recordId(item.id)]}
                      class="rounded-xl bg-blue-500 px-3 py-2 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50"
                    >
                      {actionLoading[recordId(item.id)]
                        ? "処理中..."
                        : "あげる"}
                    </button>
                  </div>
                {/if}
              </div>
            </div>
          </div>
        </article>
      {/each}
    </div>
  {/if}
</main>
