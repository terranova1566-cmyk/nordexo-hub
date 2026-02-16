import { NextResponse } from "next/server";
import { requireB2BInternal } from "@/lib/b2b/server/auth";
import { getLookbook, listLookbookItems, updateLookbook } from "@/lib/b2b/services/lookbooks";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireB2BInternal();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  try {
    const lookbook = await getLookbook(auth.supabase, id);
    const items = await listLookbookItems(auth.supabase, id);
    return NextResponse.json({ lookbook, items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to load lookbook.";
    const status = message.toLowerCase().includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireB2BInternal();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  let payload: any = null;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  try {
    await updateLookbook(
      auth.supabase,
      id,
      {
        title: typeof payload?.title === "string" ? payload.title : undefined,
        description:
          payload?.description !== undefined ? (payload.description as string | null) : undefined,
      },
      { updated_by: auth.user.id }
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to update lookbook.";
    const status = message.toLowerCase().includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

