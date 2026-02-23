import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { resolvePendingAiEdit } from "@/lib/draft-ai-edits";

export const runtime = "nodejs";

const requireAdmin = async () => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false as const,
      userId: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: settings, error: settingsError } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (settingsError) {
    return {
      ok: false as const,
      userId: user.id,
      response: NextResponse.json({ error: settingsError.message }, { status: 500 }),
    };
  }

  if (!settings?.is_admin) {
    return {
      ok: false as const,
      userId: user.id,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true as const, userId: user.id };
};

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const originalPath = String(body.originalPath || "").trim();
  const decisionRaw = String(body.decision || "").trim().toLowerCase();

  if (!originalPath) {
    return NextResponse.json({ error: "Missing originalPath." }, { status: 400 });
  }
  if (
    decisionRaw !== "keep_original" &&
    decisionRaw !== "replace_with_ai" &&
    decisionRaw !== "keep_both"
  ) {
    return NextResponse.json({ error: "Invalid decision." }, { status: 400 });
  }

  try {
    const result = await resolvePendingAiEdit({
      originalPath,
      decision: decisionRaw,
      requestedBy: auth.userId,
    });
    return NextResponse.json({
      ok: true,
      item: result.item,
      refreshedScores: result.refreshedScores,
      scoreRefreshErrors: result.scoreRefreshErrors,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unable to resolve AI edit." },
      { status: 400 }
    );
  }
}
