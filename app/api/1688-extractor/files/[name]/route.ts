import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  deleteExtractorFile,
  readExtractorFile,
  removeExtractorItems,
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
  _request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { name } = await params;
  const payload = readExtractorFile(decodeURIComponent(name));
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
  let payload: any = null;
  try {
    payload = await request.json();
  } catch {
    payload = null;
  }

  const indexes = Array.isArray(payload?.removeIndexes)
    ? payload.removeIndexes.map((value: unknown) => Number(value)).filter(Number.isFinite)
    : [];
  if (!indexes.length) {
    return NextResponse.json({ error: "No items selected." }, { status: 400 });
  }

  try {
    const updated = removeExtractorItems(decodedName, indexes);
    try {
      await generateQueueKeywordsForFile(decodedName, {
        force: true,
        mode: "fast",
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
