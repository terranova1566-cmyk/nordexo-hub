import { NextResponse } from "next/server";
import { requireB2BInternal } from "@/lib/b2b/server/auth";
import { getShareLink } from "@/lib/b2b/services/share-links";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireB2BInternal();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  try {
    const shareLink = await getShareLink(auth.supabase, id);
    return NextResponse.json({ shareLink });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to load share link.";
    const status = message.toLowerCase().includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

