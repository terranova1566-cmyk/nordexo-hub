import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  deleteExtractorFile,
  patchExtractorItems,
  readExtractorFileText,
  readExtractorFile,
  type ExtractorVariantSelectionUpdate,
  writeExtractorFileText,
} from "@/lib/1688-extractor";
import { generateQueueKeywordsForFile } from "@/lib/queue-keywords";
import { warmQueueImageCacheForFile } from "@/lib/queue-image-cache";

export const runtime = "nodejs";

const requireAdmin = async () => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: settings } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!settings?.is_admin) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { error: null };
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { name } = await params;
  const decodedName = decodeURIComponent(name);
  const query = new URL(request.url);
  const mode = String(query.searchParams.get("mode") || "").trim().toLowerCase();
  if (mode === "raw") {
    const text = readExtractorFileText(decodedName);
    if (text == null) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    return NextResponse.json({ name: decodedName, text });
  }
  const payload = readExtractorFile(decodedName);
  if (!payload) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json(payload);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { name } = await params;
  const success = deleteExtractorFile(decodeURIComponent(name));
  if (!success) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { name } = await params;
  let decodedName = "";
  try {
    decodedName = decodeURIComponent(name);
  } catch {
    return NextResponse.json({ error: "Invalid file name." }, { status: 400 });
  }
  let payload: unknown = null;
  try {
    payload = await request.json();
  } catch {
    payload = null;
  }

  const bodyRecord =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : ({} as Record<string, unknown>);

  const indexes = Array.isArray(bodyRecord.removeIndexes)
    ? bodyRecord.removeIndexes
        .map((value: unknown) => Number(value))
        .filter(Number.isFinite)
    : [];
  const variantUpdates = Array.isArray(bodyRecord.variantUpdates)
    ? bodyRecord.variantUpdates
        .map((row: unknown) => {
          if (!row || typeof row !== "object") return null;
          const rec = row as Record<string, unknown>;
          const index = Number(rec.index);
          if (!Number.isInteger(index) || index < 0) return null;
          const selectedComboIndexes = Array.isArray(rec.selectedComboIndexes)
            ? rec.selectedComboIndexes
                .map((value) => Number(value))
                .filter((value) => Number.isInteger(value) && value >= 0)
            : [];
          const out: ExtractorVariantSelectionUpdate = {
            index,
            selectedComboIndexes,
          };
          return out;
        })
        .filter((row): row is ExtractorVariantSelectionUpdate => Boolean(row))
    : [];
  if (!indexes.length && !variantUpdates.length) {
    return NextResponse.json({ error: "No changes supplied." }, { status: 400 });
  }

  try {
    const updated = patchExtractorItems(decodedName, {
      removeIndexes: indexes,
      variantUpdates,
    });
    try {
      await generateQueueKeywordsForFile(decodedName, {
        force: true,
        mode: "full",
      });
    } catch {
      // best-effort metadata refresh after patch
    }
    void warmQueueImageCacheForFile(decodedName).catch(() => {
      // best-effort image cache warm after patch
    });
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Unable to update file." },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { name } = await params;
  let decodedName = "";
  try {
    decodedName = decodeURIComponent(name);
  } catch {
    return NextResponse.json({ error: "Invalid file name." }, { status: 400 });
  }

  let payload: Record<string, unknown> | null = null;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    payload = null;
  }
  const text = typeof payload?.text === "string" ? payload.text : "";
  if (!text.trim()) {
    return NextResponse.json({ error: "JSON content is empty." }, { status: 400 });
  }

  try {
    const updated = writeExtractorFileText(decodedName, text);
    try {
      await generateQueueKeywordsForFile(decodedName, {
        force: true,
        mode: "full",
      });
    } catch {
      // best-effort metadata refresh after save
    }
    void warmQueueImageCacheForFile(decodedName).catch(() => {
      // best-effort image cache warm after save
    });
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Unable to save JSON file." },
      { status: 500 }
    );
  }
}
