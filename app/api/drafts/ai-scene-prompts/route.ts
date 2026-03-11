import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { resolveDraftPath, DRAFT_ROOT } from "@/lib/drafts";

export const runtime = "nodejs";

const DEFAULT_MODEL =
  process.env.DRAFT_PRODUCT_SCENE_IDEA_MODEL ||
  process.env.OPENAI_EDIT_MODEL ||
  "gpt-5.2";

const supportsCustomTemperature = (model: string) =>
  !/^gpt-5(?:[.-]|$)/i.test(String(model || "").trim());

const requireAdmin = async () => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: settings } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!settings?.is_admin) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true as const };
};

const normalizeLine = (value: unknown) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

type ScenePromptIdea = {
  title: string;
  prompt: string;
};

const SCENE_PROMPTS_CACHE_FILE_NAME = "scene-prompt-ideas.json";
const SCENE_PROMPTS_CACHE_VERSION = "scene-title-v2";

const buildSourceHash = (productTitle: string, productDescription: string) =>
  createHash("sha1")
    .update(`${SCENE_PROMPTS_CACHE_VERSION}\n${productTitle}\n${productDescription}`)
    .digest("hex");

const isInsideDraftRoot = (targetPath: string) => {
  const relative = path.relative(DRAFT_ROOT, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const resolveScenePromptCachePath = (draftProductPath: string) => {
  const normalized = String(draftProductPath || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  if (!normalized) return null;
  const absoluteProductPath = resolveDraftPath(normalized);
  if (!absoluteProductPath || !isInsideDraftRoot(absoluteProductPath)) return null;
  const filesDir = path.join(absoluteProductPath, "Files (F)");
  return {
    productAbsolutePath: absoluteProductPath,
    cacheAbsolutePath: path.join(filesDir, SCENE_PROMPTS_CACHE_FILE_NAME),
  };
};

const extractJsonFromText = (text: string) => {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {}

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {}
  }

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
};

const deriveScenePromptTitle = (prompt: string) => {
  const normalized = normalizeLine(prompt);
  if (!normalized) return "";
  const firstClause =
    normalized.split(/[.!?]/)[0]?.split(/[,;:()-]/)[0]?.trim() || normalized;
  const words = firstClause.split(/\s+/).filter(Boolean);
  return normalizeLine(words.slice(0, Math.min(6, Math.max(3, words.length))).join(" "));
};

const normalizeScenePromptIdea = (value: unknown): ScenePromptIdea | null => {
  if (typeof value === "string") {
    const prompt = normalizeLine(value);
    if (!prompt) return null;
    const title = deriveScenePromptTitle(prompt);
    return title ? { title, prompt } : null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const title = normalizeLine(record.title);
  const prompt = normalizeLine(record.prompt ?? record.idea ?? record.description);
  if (!prompt) return null;
  return {
    title: title || deriveScenePromptTitle(prompt),
    prompt,
  };
};

const buildPrompt = (input: {
  productTitle: string;
  productDescription: string;
}) =>
  [
    "Act as a creative director for Swedish/Nordic e-commerce lifestyle imagery.",
    "",
    "Based on the PRODUCT TITLE and SHORT DESCRIPTION, identify the product type and its natural real-life use.",
    "Generate 5-10 ranked image prompt ideas showing the product used in realistic commercial lifestyle scenes.",
    "These prompt ideas must be universal scene directions only.",
    "Do not lock the ideas to any gender, family type, or age group. Those casting choices will be added later in a separate prompt layer.",
    "Each prompt idea must include a short title and a prompt body.",
    "",
    "Requirements:",
    "- Tailored for Swedish/Nordic customers and environments",
    "- Clean, modern, natural, and commercially realistic",
    "- Scenes should reflect how the product would genuinely be used in everyday life",
    "- Rank ideas from simple, safe commercial scenes first to more creative concepts last",
    "- Each idea should be 1-2 sentences",
    "- Vary the environments and situations",
    "- Keep the product as the visual focus",
    "- Prefer believable Nordic settings (home, kitchen, gym, office, city street, nature, summer house, workshop, cafe, etc.)",
    "- When relevant, naturally reflect Nordic seasons and lighting",
    "- Avoid fantasy, cluttered scenes, exaggerated luxury, or overly American-style advertising",
    '- The title must be one short, polished sentence that captures the environment at a glance',
    '- The title should be easy to scan quickly, professional, and descriptive of the scene itself',
    '- The title should usually be about 5-10 words and read like a compact scene caption, not a fragment or label',
    '- Good examples: "He walks a quiet forest trail" or "She prepares breakfast in a bright kitchen"',
    "- The prompt body should be 1-2 sentences with the actual scene direction and extra context",
    "",
    "Return strict JSON only in this shape:",
    "{",
    '  "ideas": [',
    '    { "title": "On the way to the gym", "prompt": "A clean Nordic city-street lifestyle scene..." },',
    '    { "title": "Morning smoothie at home", "prompt": "A bright Scandinavian kitchen scene..." }',
    "  ]",
    "}",
    "",
    `PRODUCT TITLE: ${input.productTitle}`,
    `SHORT DESCRIPTION: ${input.productDescription || "Not available."}`,
  ].join("\n");

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const productTitle = normalizeLine(body.productTitle);
  const productDescription = normalizeLine(body.productDescription);
  const draftProductPath = normalizeLine(body.draftProductPath);
  const sourceHash = buildSourceHash(productTitle, productDescription);

  if (!productTitle) {
    return NextResponse.json({ error: "Missing productTitle." }, { status: 400 });
  }

  const resolvedCache = draftProductPath
    ? resolveScenePromptCachePath(draftProductPath)
    : null;
  if (draftProductPath && !resolvedCache) {
    return NextResponse.json({ error: "Invalid draftProductPath." }, { status: 400 });
  }

  if (resolvedCache && fs.existsSync(resolvedCache.cacheAbsolutePath)) {
    try {
      const cachedRaw = JSON.parse(fs.readFileSync(resolvedCache.cacheAbsolutePath, "utf8"));
      const cachedIdeas = Array.isArray(cachedRaw?.ideas)
        ? cachedRaw.ideas
            .map((value: unknown) => normalizeScenePromptIdea(value))
            .filter(
              (value: ScenePromptIdea | null): value is ScenePromptIdea => Boolean(value)
            )
            .slice(0, 10)
        : [];
      const cachedHash = normalizeLine(cachedRaw?.sourceHash);
      if (cachedIdeas.length > 0 && cachedHash === sourceHash) {
        return NextResponse.json({ ideas: cachedIdeas, cached: true });
      }
    } catch {}
  }

  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    return NextResponse.json({ error: "Missing OPENAI_API_KEY." }, { status: 500 });
  }

  const model = String(DEFAULT_MODEL || "gpt-5.2").trim() || "gpt-5.2";
  const payload: Record<string, unknown> = {
    model,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: buildPrompt({
          productTitle,
          productDescription,
        }),
      },
    ],
  };

  if (supportsCustomTemperature(model)) {
    payload.temperature = 0.4;
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json(
      { error: `OpenAI error (${response.status}): ${errorText.slice(0, 600)}` },
      { status: 500 }
    );
  }

  const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const choices = Array.isArray(result.choices) ? result.choices : [];
  const firstChoice =
    choices.length > 0 && choices[0] && typeof choices[0] === "object"
      ? (choices[0] as Record<string, unknown>)
      : null;
  const message =
    firstChoice && firstChoice.message && typeof firstChoice.message === "object"
      ? (firstChoice.message as Record<string, unknown>)
      : null;
  const rawText = String(message?.content || "").trim();
  const parsed = extractJsonFromText(rawText);
  const parsedRecord = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  const ideas = Array.isArray(parsedRecord?.ideas)
    ? (parsedRecord.ideas as unknown[])
        .map((value) => normalizeScenePromptIdea(value))
        .filter(
          (value: ScenePromptIdea | null): value is ScenePromptIdea => Boolean(value)
        )
        .slice(0, 10)
    : [];

  if (ideas.length === 0) {
    return NextResponse.json(
      { error: "No prompt ideas were returned by the model." },
      { status: 500 }
    );
  }

  if (resolvedCache) {
    try {
      fs.mkdirSync(path.dirname(resolvedCache.cacheAbsolutePath), { recursive: true });
      fs.writeFileSync(
        resolvedCache.cacheAbsolutePath,
        JSON.stringify(
            {
            cacheVersion: SCENE_PROMPTS_CACHE_VERSION,
            sourceHash,
            updatedAt: new Date().toISOString(),
            productTitle,
            productDescription,
            ideas,
          },
          null,
          2
        ),
        "utf8"
      );
    } catch {}
  }

  return NextResponse.json({ ideas, cached: false });
}
