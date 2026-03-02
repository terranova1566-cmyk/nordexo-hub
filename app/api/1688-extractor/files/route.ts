import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { listExtractorFiles } from "@/lib/1688-extractor";
import { readQueueKeywordCacheForFile } from "@/lib/queue-keywords";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: settings } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!settings?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const items = listExtractorFiles().map((item) => {
    const keywordCache = readQueueKeywordCacheForFile(item.name);
    const hasAiKeywords = keywordCache?.source === "openai";
    return {
      ...item,
      keywordLabel: keywordCache?.label ?? "",
      keywordItems: Array.isArray(keywordCache?.keywords)
        ? keywordCache.keywords
        : [],
      keywordCached: hasAiKeywords,
      keywordSource: keywordCache?.source ?? null,
      keywordUpdatedAt: keywordCache?.updatedAt ?? null,
    };
  });

  return NextResponse.json({ items });
}
