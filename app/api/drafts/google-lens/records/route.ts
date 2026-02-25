import path from "node:path";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getStoredLensSearchRecordForImagePath } from "@/lib/draft-google-lens-search-store";

export const runtime = "nodejs";

const normalizePathList = (value: unknown) => {
  if (!Array.isArray(value)) return [] as string[];
  return Array.from(
    new Set(
      value
        .map((item) => String(item || "").trim())
        .filter((item) => Boolean(item))
    )
  ).slice(0, 240);
};

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

  const { data: settings, error: settingsError } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (settingsError) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: settingsError.message }, { status: 500 }),
    };
  }

  if (!settings?.is_admin) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true as const };
};

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const includeItems = Boolean(payload.includeItems);
  const imagePath =
    typeof payload.imagePath === "string" ? payload.imagePath.trim() : "";
  const imagePaths = normalizePathList(payload.imagePaths);
  const targets =
    imagePath && !imagePaths.includes(imagePath)
      ? [imagePath, ...imagePaths]
      : imagePaths;

  if (targets.length === 0) {
    return NextResponse.json(
      { error: "Provide imagePath or imagePaths." },
      { status: 400 }
    );
  }

  const records = await Promise.all(
    targets.map(async (targetPath) => {
      const stored = await getStoredLensSearchRecordForImagePath(targetPath);
      if (!stored || !stored.record) {
        return {
          targetImagePath: targetPath,
          targetImageName: path.posix.basename(targetPath || ""),
          imageHash: stored?.imageHash ?? null,
          hasRecord: false,
          status: "idle" as const,
          startedAt: null,
          finishedAt: null,
          searchId: null,
          resultCount: 0,
          amazonCount: 0,
          error: null,
          items: [] as unknown[],
          amazonLinks: [] as string[],
          inputPayload: null,
          debugPayload: null,
        };
      }
      const record = stored.record;
      const searchImagePath = record.sourceImagePath || stored.imagePath;
      return {
        targetImagePath: stored.imagePath,
        targetImageName: path.posix.basename(stored.imagePath || ""),
        searchImagePath,
        searchImageName: path.posix.basename(searchImagePath || ""),
        imageHash: stored.imageHash,
        hasRecord: true,
        status: record.error ? ("error" as const) : ("ready" as const),
        startedAt: record.createdAt,
        finishedAt: record.updatedAt,
        searchId: record.searchId,
        resultCount: record.items.length,
        amazonCount: record.amazonLinks.length,
        error: record.error,
        items: includeItems ? record.items : [],
        amazonLinks: includeItems ? record.amazonLinks : [],
        inputPayload: includeItems ? record.inputPayload : null,
        debugPayload: includeItems ? record.debugPayload : null,
      };
    })
  );

  return NextResponse.json({
    ok: true,
    count: records.length,
    includeItems,
    records,
  });
}
