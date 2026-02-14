import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  type AiTemplatePreset,
  createTemplatePresetOutputs,
  createPendingAiEdit,
  listPendingAiEdits,
  resolvePendingAiEdit,
} from "@/lib/draft-ai-edits";

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

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const folder = String(url.searchParams.get("folder") || "").trim();
  if (!folder) {
    return NextResponse.json({ error: "Missing folder." }, { status: 400 });
  }

  try {
    const edits = listPendingAiEdits(folder);
    return NextResponse.json({ items: edits });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unable to list AI edits." },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const relativePath = String(body.path || "").trim();
  const providerRaw = String(body.provider || "").trim().toLowerCase();
  const modeRaw = String(body.mode || "").trim().toLowerCase();
  const prompt = String(body.prompt || "");
  const templatePresetRaw =
    typeof body.templatePreset === "string" ? body.templatePreset.trim().toLowerCase() : "";
  const outputCountRaw = body.outputCount ?? body.outputs ?? body.count;
  const applyRaw = body.apply;

  if (!relativePath) {
    return NextResponse.json({ error: "Missing path." }, { status: 400 });
  }
  if (providerRaw !== "chatgpt" && providerRaw !== "gemini" && providerRaw !== "zimage") {
    return NextResponse.json({ error: "Invalid provider." }, { status: 400 });
  }
  if (
    modeRaw !== "template" &&
    modeRaw !== "direct" &&
    modeRaw !== "white_background" &&
    modeRaw !== "auto_center_white" &&
    modeRaw !== "eraser" &&
    modeRaw !== "upscale"
  ) {
    return NextResponse.json({ error: "Invalid mode." }, { status: 400 });
  }
  if (
    providerRaw === "zimage" &&
    modeRaw !== "direct" &&
    modeRaw !== "white_background" &&
    modeRaw !== "auto_center_white" &&
    modeRaw !== "eraser" &&
    modeRaw !== "upscale"
  ) {
    return NextResponse.json({ error: "Invalid mode for ZImage." }, { status: 400 });
  }
  if (
    (providerRaw === "chatgpt" || providerRaw === "gemini") &&
    modeRaw !== "template" &&
    modeRaw !== "direct"
  ) {
    return NextResponse.json(
      { error: "Invalid mode for ChatGPT/Gemini." },
      { status: 400 }
    );
  }

  let templatePreset: AiTemplatePreset | undefined;
  if (templatePresetRaw) {
    if (templatePresetRaw === "standard") templatePreset = "standard";
    else if (templatePresetRaw === "digideal_main" || templatePresetRaw === "digideal-main") {
      templatePreset = "digideal_main";
    } else if (templatePresetRaw === "product_scene" || templatePresetRaw === "product-scene") {
      templatePreset = "product_scene";
    } else {
      return NextResponse.json({ error: "Invalid template preset." }, { status: 400 });
    }
  }

  const outputCount = (() => {
    if (outputCountRaw == null) return 1;
    const parsed = Number(outputCountRaw);
    if (!Number.isFinite(parsed)) return 1;
    return Math.max(1, Math.min(3, Math.floor(parsed)));
  })();

  const defaultApply =
    providerRaw === "zimage" &&
    (modeRaw === "upscale" || modeRaw === "white_background" || modeRaw === "auto_center_white");
  const apply = typeof applyRaw === "boolean" ? applyRaw : defaultApply;

  if (apply && providerRaw !== "zimage") {
    return NextResponse.json({ error: "Apply is only supported for ZImage edits." }, { status: 400 });
  }

  try {
    // DigiDeal Main & Product Scene now auto-save outputs directly into the folder (no review/resolve flow).
    if (
      (providerRaw === "chatgpt" || providerRaw === "gemini") &&
      modeRaw === "template" &&
      (templatePreset === "digideal_main" || templatePreset === "product_scene")
    ) {
      const createdPaths = await createTemplatePresetOutputs({
        relativePath,
        provider: providerRaw,
        templatePreset,
        count: outputCount,
        requestedBy: auth.userId,
      });
      return NextResponse.json({ ok: true, createdPaths });
    }

    const record = await createPendingAiEdit({
      relativePath,
      provider: providerRaw,
      mode: modeRaw,
      prompt,
      templatePreset,
      requestedBy: auth.userId,
    });
    if (apply) {
      await resolvePendingAiEdit({
        originalPath: record.originalPath,
        decision: "replace_with_ai",
        requestedBy: auth.userId,
      });
      return NextResponse.json({ ok: true, applied: true, originalPath: record.originalPath });
    }
    return NextResponse.json({ ok: true, item: record });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI edit failed." },
      { status: 400 }
    );
  }
}
