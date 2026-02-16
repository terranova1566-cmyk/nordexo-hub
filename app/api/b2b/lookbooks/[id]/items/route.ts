import { NextResponse } from "next/server";
import { requireB2BInternal } from "@/lib/b2b/server/auth";
import { listLookbookItems } from "@/lib/b2b/services/lookbooks";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireB2BInternal();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  try {
    const items = await listLookbookItems(auth.supabase, id);
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unable to load lookbook items." },
      { status: 500 }
    );
  }
}

