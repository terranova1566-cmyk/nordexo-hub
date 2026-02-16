import { NextResponse } from "next/server";
import { requireB2BInternal } from "@/lib/b2b/server/auth";
import { getCandidate, updateCandidate } from "@/lib/b2b/services/candidates";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireB2BInternal();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  try {
    const candidate = await getCandidate(auth.supabase, id);
    return NextResponse.json({ candidate });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to load candidate.";
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
    await updateCandidate(auth.supabase, id, payload ?? {}, {
      updated_by: auth.user.id,
      forceStatus: Boolean(payload?.force_status),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to update candidate.";
    const status = message.toLowerCase().includes("not found")
      ? 404
      : message.toLowerCase().includes("invalid")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

