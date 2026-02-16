import { NextResponse } from "next/server";
import { requireB2BInternal } from "@/lib/b2b/server/auth";
import { getCustomer, updateCustomer } from "@/lib/b2b/services/customers";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireB2BInternal();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  try {
    const customer = await getCustomer(auth.supabase, id);
    const { data: projects, error } = await auth.supabase
      .from("b2b_projects")
      .select("id, title, status, updated_at")
      .eq("customer_id", id)
      .order("updated_at", { ascending: false })
      .limit(200);

    if (error) throw new Error(error.message);

    return NextResponse.json({ customer, projects: projects ?? [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unable to load customer." },
      { status: 500 }
    );
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
    await updateCustomer(
      auth.supabase,
      id,
      {
        name: typeof payload?.name === "string" ? payload.name : undefined,
        main_currency:
          typeof payload?.main_currency === "string" ? payload.main_currency : undefined,
        contacts: payload?.contacts,
        org_info: payload?.org_info,
      },
      { updated_by: auth.user.id }
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to update customer.";
    const status = message.toLowerCase().includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

