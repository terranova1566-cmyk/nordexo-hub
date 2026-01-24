import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

type CategorySelection = {
  level: "l1" | "l2" | "l3";
  value: string;
};

const normalizeSelections = (input: unknown): CategorySelection[] => {
  if (!Array.isArray(input)) return [];
  const selections = input
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const level = (entry as CategorySelection).level;
      const value = (entry as CategorySelection).value?.trim?.();
      if (level !== "l1" && level !== "l2" && level !== "l3") return null;
      if (!value) return null;
      return { level, value } as CategorySelection;
    })
    .filter((entry): entry is CategorySelection => Boolean(entry));

  const seen = new Set<string>();
  return selections.filter((entry) => {
    const key = `${entry.level}:${entry.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const normalizeKeywords = (input: unknown): string[] => {
  if (!Array.isArray(input)) return [];
  const keywords = input
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
  return Array.from(new Set(keywords));
};

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: categories, error: categoryError } = await supabase
    .from("discovery_hidden_categories")
    .select("level, value")
    .eq("user_id", user.id);

  if (categoryError) {
    return NextResponse.json({ error: categoryError.message }, { status: 500 });
  }

  const { data: keywords, error: keywordError } = await supabase
    .from("discovery_hidden_keywords")
    .select("keyword")
    .eq("user_id", user.id);

  if (keywordError) {
    return NextResponse.json({ error: keywordError.message }, { status: 500 });
  }

  return NextResponse.json({
    categories: (categories ?? []) as CategorySelection[],
    keywords: (keywords ?? []).map((row) => row.keyword),
  });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { categories?: unknown; keywords?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const categories = normalizeSelections(payload?.categories);
  const keywords = normalizeKeywords(payload?.keywords);

  const { error: deleteCategoryError } = await supabase
    .from("discovery_hidden_categories")
    .delete()
    .eq("user_id", user.id);

  if (deleteCategoryError) {
    return NextResponse.json(
      { error: deleteCategoryError.message },
      { status: 500 }
    );
  }

  if (categories.length > 0) {
    const rows = categories.map((entry) => ({
      user_id: user.id,
      level: entry.level,
      value: entry.value,
    }));
    const { error } = await supabase
      .from("discovery_hidden_categories")
      .insert(rows);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const { error: deleteKeywordError } = await supabase
    .from("discovery_hidden_keywords")
    .delete()
    .eq("user_id", user.id);

  if (deleteKeywordError) {
    return NextResponse.json(
      { error: deleteKeywordError.message },
      { status: 500 }
    );
  }

  if (keywords.length > 0) {
    const rows = keywords.map((keyword) => ({
      user_id: user.id,
      keyword,
    }));
    const { error } = await supabase
      .from("discovery_hidden_keywords")
      .insert(rows);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
