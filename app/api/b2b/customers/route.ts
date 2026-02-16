import { NextResponse } from "next/server";
import { requireB2BInternal } from "@/lib/b2b/server/auth";
import { createCustomer, listCustomers } from "@/lib/b2b/services/customers";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireB2BInternal();
  if (!auth.ok) return auth.response;

  try {
    const items = await listCustomers(auth.supabase);
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unable to load customers." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireB2BInternal();
  if (!auth.ok) return auth.response;

  let payload: { name?: unknown; main_currency?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const mainCurrency =
    typeof payload.main_currency === "string" ? payload.main_currency.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "Missing name." }, { status: 400 });
  }

  try {
    const id = await createCustomer(auth.supabase, {
      name,
      main_currency: mainCurrency || "SEK",
      created_by: auth.user.id,
    });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unable to create customer." },
      { status: 500 }
    );
  }
}

