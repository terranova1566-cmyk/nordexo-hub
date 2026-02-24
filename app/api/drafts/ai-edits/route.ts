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
  const guidanceRelativePath = String(body.secondaryPath || body.guidancePath || "").trim();
  const collectionRelativePaths = Array.isArray(body.collectionPaths)
    ? body.collectionPaths
        .map((value) => String(value || "").trim())
        .filter((value) => Boolean(value))
    : [];
  const providerRaw = String(body.provider || "").trim().toLowerCase();
  const modeRaw = String(body.mode || "").trim().toLowerCase();
  const prompt = String(body.prompt || "");
  const maskDataUrl = typeof body.maskDataUrl === "string" ? body.maskDataUrl.trim() : "";
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
  if (maskDataUrl && modeRaw !== "eraser") {
    return NextResponse.json(
      { error: "Mask payload is only supported for eraser mode." },
      { status: 400 }
    );
  }

  let templatePreset: AiTemplatePreset | undefined;
  if (templatePresetRaw) {
    if (templatePresetRaw === "standard") templatePreset = "standard";
    else if (templatePresetRaw === "digideal_main" || templatePresetRaw === "digideal-main") {
      templatePreset = "digideal_main";
    } else if (
      templatePresetRaw === "digideal_main_dual" ||
      templatePresetRaw === "digideal-main-dual"
    ) {
      templatePreset = "digideal_main_dual";
    } else if (templatePresetRaw === "product_scene" || templatePresetRaw === "product-scene") {
      templatePreset = "product_scene";
    } else if (
      templatePresetRaw === "product_collection" ||
      templatePresetRaw === "product-collection"
    ) {
      templatePreset = "product_collection";
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
    // Template presets auto-save outputs directly into the folder (no review/resolve flow).
    if (
      (providerRaw === "chatgpt" || providerRaw === "gemini") &&
      modeRaw === "template" &&
      (templatePreset === "digideal_main" ||
        templatePreset === "digideal_main_dual" ||
        templatePreset === "product_scene" ||
        templatePreset === "product_collection")
    ) {
      if (templatePreset === "digideal_main_dual" && !guidanceRelativePath) {
        return NextResponse.json(
          { error: "Dual preset requires a secondary guidance image path." },
          { status: 400 }
        );
      }
      if (
        templatePreset === "product_collection" &&
        (collectionRelativePaths.length < 2 || collectionRelativePaths.length > 4)
      ) {
        return NextResponse.json(
          { error: "Product Collection requires selecting 2 to 4 images." },
          { status: 400 }
        );
      }
      const createdPaths = await createTemplatePresetOutputs({
        relativePath,
        guidanceRelativePath:
          templatePreset === "digideal_main_dual" ? guidanceRelativePath : undefined,
        collectionRelativePaths:
          templatePreset === "product_collection" ? collectionRelativePaths : undefined,
        provider: providerRaw,
        templatePreset,
        count: outputCount,
        prompt,
        requestedBy: auth.userId,
      });
      return NextResponse.json({ ok: true, createdPaths });
    }

    const record = await createPendingAiEdit({
      relativePath,
      provider: providerRaw,
      mode: modeRaw,
      prompt,
      maskDataUrl,
      templatePreset,
      requestedBy: auth.userId,
    });
    if (apply) {
      const resolved = await resolvePendingAiEdit({
        originalPath: record.originalPath,
        decision: "replace_with_ai",
        requestedBy: auth.userId,
      });
      const refreshedOriginal = resolved.refreshedScores.find(
        (entry) => entry.path === record.originalPath
      );
      return NextResponse.json({
        ok: true,
        applied: true,
        originalPath: record.originalPath,
        pixelQualityScore: refreshedOriginal?.pixelQualityScore ?? null,
        refreshedScores: resolved.refreshedScores,
        scoreRefreshErrors: resolved.scoreRefreshErrors,
        discardedMoves: resolved.discardedMoves,
      });
    }
    return NextResponse.json({ ok: true, item: record });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI edit failed." },
      { status: 400 }
    );
  }
}
