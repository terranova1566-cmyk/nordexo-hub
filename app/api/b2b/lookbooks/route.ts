import { NextResponse } from "next/server";
import { requireB2BInternal } from "@/lib/b2b/server/auth";
import { createLookbook, listLookbooks } from "@/lib/b2b/services/lookbooks";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireB2BInternal();
  if (!auth.ok) return auth.response;

  try {
    const items = await listLookbooks(auth.supabase);
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unable to load lookbooks." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireB2BInternal();
  if (!auth.ok) return auth.response;

  let payload: any = null;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const title = typeof payload?.title === "string" ? payload.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "Missing title." }, { status: 400 });
  }

  try {
    const id = await createLookbook(auth.supabase, {
      title,
      description: typeof payload?.description === "string" ? payload.description : null,
      supplier_id: typeof payload?.supplier_id === "string" ? payload.supplier_id : null,
      curated_for_customer_id:
        typeof payload?.curated_for_customer_id === "string"
          ? payload.curated_for_customer_id
          : null,
      created_by: auth.user.id,
    });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unable to create lookbook." },
      { status: 500 }
    );
  }
}

