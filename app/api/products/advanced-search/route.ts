import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

const PROMPT_PATH =
  process.env.ADVANCED_SEARCH_PROMPT_PATH ||
  path.join(process.cwd(), "app/app/products/advanced-search-prompt.txt");

const MODEL =
  process.env.ADVANCED_SEARCH_MODEL ||
  process.env.OPENAI_EDIT_MODEL ||
  "gpt-5.2";

const extractJsonFromText = (text: string) => {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {}
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
};

const sanitizeTerms = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  value.forEach((entry) => {
    const term = String(entry || "").trim();
    if (!term) return;
    if (!out.includes(term)) out.push(term);
  });
  return out;
};

const buildExpandedQuery = (core: string[], support: string[], fallback: string) => {
  const coreBoosted = core.flatMap((term) => [term, term]);
  const supportUnique = support.filter((term) => !core.includes(term));
  const tokens = [...coreBoosted, ...supportUnique];
  if (tokens.length === 0) return fallback;
  return tokens.join(" ").trim();
};

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const query = String(body?.query || "").trim();
  if (!query) {
    return NextResponse.json({ error: "Missing query." }, { status: 400 });
  }

  if (!fs.existsSync(PROMPT_PATH)) {
    return NextResponse.json({ error: "Prompt file missing." }, { status: 500 });
  }

  const promptTemplate = fs.readFileSync(PROMPT_PATH, "utf8");
  const prompt = promptTemplate.replace("{{INPUT_TEXT}}", query);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing OPENAI_API_KEY." }, { status: 500 });
  }

  const bodyPayload: Record<string, unknown> = {
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    response_format: { type: "json_object" },
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(bodyPayload),
  });

  if (!response.ok) {
    const errText = await response.text();
    return NextResponse.json(
      { error: `OpenAI error (${response.status}): ${errText.slice(0, 300)}` },
      { status: 500 }
    );
  }

  const result = await response.json();
  const content = result?.choices?.[0]?.message?.content || "";
  const parsed = extractJsonFromText(content);
  if (!parsed || typeof parsed !== "object") {
    return NextResponse.json({ error: "Unable to parse model response." }, { status: 500 });
  }

  const rawCoreTerms = sanitizeTerms((parsed as any).core_terms);
  const supportTerms = sanitizeTerms((parsed as any).support_terms);
  const coreTerms = rawCoreTerms.slice(0, 2);
  const extraCore = rawCoreTerms.slice(2);
  if (extraCore.length > 0) {
    extraCore.forEach((term) => {
      if (!supportTerms.includes(term)) {
        supportTerms.push(term);
      }
    });
  }
  const ignoredTerms = sanitizeTerms((parsed as any).ignored_terms);
  const language = String((parsed as any).language || "").trim() || null;
  const translated = String((parsed as any).translated_sv || "").trim() || null;

  const expandedQuery = buildExpandedQuery(coreTerms, supportTerms, query);
  const coreQuery = coreTerms.join(" ").trim();

  return NextResponse.json({
    query,
    prompt,
    model: MODEL,
    raw_response: content,
    language,
    translated_sv: translated,
    core_terms: coreTerms,
    support_terms: supportTerms,
    ignored_terms: ignoredTerms,
    expanded_query: expandedQuery,
    core_query: coreQuery,
  });
}
