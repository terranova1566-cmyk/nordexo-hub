import { NextResponse } from "next/server";
import { requireB2BInternal } from "@/lib/b2b/server/auth";
import { updateLookbookItem } from "@/lib/b2b/services/lookbooks";

export const runtime = "nodejs";

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
    await updateLookbookItem(
      auth.supabase,
      id,
      {
        title: payload?.title,
        image_url: payload?.image_url,
        preview_price_cny:
          payload?.preview_price_cny !== undefined ? payload.preview_price_cny : undefined,
        exposed_to_customer:
          typeof payload?.exposed_to_customer === "boolean"
            ? payload.exposed_to_customer
            : undefined,
        position: payload?.position !== undefined ? payload.position : undefined,
      },
      { updated_by: auth.user.id }
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to update lookbook item.";
    const status = message.toLowerCase().includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

