export const ITEM_CATEGORY_TYPES = [
  "服・小物",
  "おもちゃ・ゲーム",
  "絵本・本・教材",
  "育児用品",
  "その他",
] as const;

export const ITEM_CATEGORY_AGES = [
  "未満児（〜2歳）",
  "幼児（3〜6歳）",
  "小学生低学年（7〜9歳）",
  "小学生高学年（10〜12歳）",
  "年齢不問",
] as const;

export const ITEM_CATEGORY_GENDERS = ["男の子", "女の子", "兼用"] as const;

export type ItemCategoryType = (typeof ITEM_CATEGORY_TYPES)[number];
export type ItemCategoryAge = (typeof ITEM_CATEGORY_AGES)[number];
export type ItemCategoryGender = (typeof ITEM_CATEGORY_GENDERS)[number];

export type ItemCategories = {
  category_type?: ItemCategoryType | null;
  category_age?: ItemCategoryAge | null;
  category_gender?: ItemCategoryGender | null;
  category_size?: string | null;
};

export const EMPTY_ITEM_CATEGORIES: ItemCategories = {
  category_type: null,
  category_age: null,
  category_gender: null,
  category_size: null,
};

function surrealOptionalStringParam(name: keyof ItemCategories) {
  return `IF $${name} = NULL THEN NONE ELSE $${name} END`;
}

export const SURREAL_ITEM_CATEGORY_CREATE_FIELDS = `
category_type: ${surrealOptionalStringParam("category_type")},
category_age: ${surrealOptionalStringParam("category_age")},
category_gender: ${surrealOptionalStringParam("category_gender")},
category_size: ${surrealOptionalStringParam("category_size")}
`.trim();

export const SURREAL_ITEM_CATEGORY_UPDATE_FIELDS = `
category_type=${surrealOptionalStringParam("category_type")},
category_age=${surrealOptionalStringParam("category_age")},
category_gender=${surrealOptionalStringParam("category_gender")},
category_size=${surrealOptionalStringParam("category_size")}
`.trim();

function pickAllowedValue<T extends readonly string[]>(
  value: unknown,
  allowed: T,
): T[number] | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return allowed.includes(normalized as T[number])
    ? (normalized as T[number])
    : null;
}

function pickSize(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeItemCategories(
  value: Partial<Record<keyof ItemCategories, unknown>> | null | undefined,
): ItemCategories {
  const categoryType = pickAllowedValue(
    value?.category_type,
    ITEM_CATEGORY_TYPES,
  );

  return {
    category_type: categoryType,
    category_age: pickAllowedValue(value?.category_age, ITEM_CATEGORY_AGES),
    category_gender: pickAllowedValue(
      value?.category_gender,
      ITEM_CATEGORY_GENDERS,
    ),
    category_size:
      categoryType === "服・小物" ? pickSize(value?.category_size) : null,
  };
}

function promptOptions(values: readonly string[]) {
  return values.map((value) => `"${value}"`).join(" / ");
}

export function createCategorizePrompt(title: string, description: string) {
  return `
以下の子供用おさがり品の出品情報を分析し、カテゴリをJSON形式で返してください。
必ず下記の選択肢の値をそのまま使用してください。

category_type の選択肢: ${promptOptions(ITEM_CATEGORY_TYPES)}
category_age の選択肢: ${promptOptions(ITEM_CATEGORY_AGES)}
category_gender の選択肢: ${promptOptions(ITEM_CATEGORY_GENDERS)}
category_size: category_typeが"服・小物"の場合のみ説明文からサイズを抽出（例: "80cm"）。それ以外はnull。

タイトル: ${title || "(なし)"}
説明: ${description || "(なし)"}

JSONのみ返してください。例:
{"category_type":"服・小物","category_age":"未満児（〜2歳）","category_gender":"男の子","category_size":"80cm"}
`.trim();
}
