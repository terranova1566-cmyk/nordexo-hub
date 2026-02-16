import { NextResponse } from "next/server";
import { requireB2BInternal } from "@/lib/b2b/server/auth";
import { createProject, listProjects } from "@/lib/b2b/services/projects";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireB2BInternal();
  if (!auth.ok) return auth.response;

  try {
    const items = await listProjects(auth.supabase);
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unable to load projects." },
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

  const customerId =
    typeof payload?.customer_id === "string" ? payload.customer_id.trim() : "";
  const title = typeof payload?.title === "string" ? payload.title.trim() : "";

  if (!customerId) {
    return NextResponse.json({ error: "Missing customer_id." }, { status: 400 });
  }
  if (!title) {
    return NextResponse.json({ error: "Missing title." }, { status: 400 });
  }

  try {
    const id = await createProject(auth.supabase, {
      customer_id: customerId,
      title,
      description: typeof payload?.description === "string" ? payload.description : null,
      brief: typeof payload?.brief === "string" ? payload.brief : null,
      currency: typeof payload?.currency === "string" ? payload.currency : null,
      exchange_rate_cny:
        payload?.exchange_rate_cny !== undefined ? Number(payload.exchange_rate_cny) : null,
      margin_percent_default:
        payload?.margin_percent_default !== undefined
          ? Number(payload.margin_percent_default)
          : null,
      margin_fixed_default:
        payload?.margin_fixed_default !== undefined ? Number(payload.margin_fixed_default) : null,
      created_by: auth.user.id,
    });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unable to create project." },
      { status: 500 }
    );
  }
}

