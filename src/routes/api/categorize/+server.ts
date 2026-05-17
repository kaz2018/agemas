import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  EMPTY_ITEM_CATEGORIES,
  createCategorizePrompt,
  normalizeItemCategories,
} from "$lib/itemCategories";

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

type CategorizeRequest = {
  title: string;
  description: string;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

async function parseRequest(request: Request): Promise<CategorizeRequest> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    error(400, "JSONボディが必要です");
  }

  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as { title?: unknown }).title !== "string" ||
    typeof (body as { description?: unknown }).description !== "string"
  ) {
    error(400, "title と description は文字列で指定してください");
  }

  return {
    title: (body as CategorizeRequest).title.trim(),
    description: (body as CategorizeRequest).description.trim(),
  };
}

export const POST: RequestHandler = async ({ request, platform }) => {
  const apiKey = platform?.env?.GOOGLE_AI_API_KEY;

  if (!apiKey) {
    error(500, "GOOGLE_AI_API_KEY binding not available");
  }

  const { title, description } = await parseRequest(request);

  try {
    const response = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: createCategorizePrompt(title, description) }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      return json({ ...EMPTY_ITEM_CATEGORIES });
    }

    const data = (await response.json()) as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const categories = JSON.parse(text) as Partial<
      Record<keyof typeof EMPTY_ITEM_CATEGORIES, unknown>
    >;

    return json(normalizeItemCategories(categories));
  } catch {
    return json({ ...EMPTY_ITEM_CATEGORIES });
  }
};
