import {
  EMPTY_ITEM_CATEGORIES,
  normalizeItemCategories,
  type ItemCategories,
} from "$lib/itemCategories";

export async function categorizeItem(
  title: string,
  description: string,
): Promise<ItemCategories> {
  try {
    const response = await fetch("/api/categorize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title, description }),
    });

    if (!response.ok) {
      return { ...EMPTY_ITEM_CATEGORIES };
    }

    const categories = (await response.json()) as Partial<
      Record<keyof ItemCategories, unknown>
    >;
    return normalizeItemCategories(categories);
  } catch {
    return { ...EMPTY_ITEM_CATEGORIES };
  }
}
