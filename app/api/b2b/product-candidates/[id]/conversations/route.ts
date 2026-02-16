import { NextResponse } from "next/server";
import { requireB2BInternal } from "@/lib/b2b/server/auth";
import { logActivity } from "@/lib/b2b/services/activity-log";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireB2BInternal();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  const { data, error } = await auth.supabase
    .from("b2b_conversation_entries")
    .select("id, channel, message, attachments, created_at, created_by")
    .eq("product_candidate_id", id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}

export async function POST(
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

  const message = typeof payload?.message === "string" ? payload.message.trim() : "";
  const channel = typeof payload?.channel === "string" ? payload.channel.trim() : "other";

  if (!message) {
    return NextResponse.json({ error: "Missing message." }, { status: 400 });
  }

  const insertPayload = {
    product_candidate_id: id,
    channel,
    message,
    attachments: payload?.attachments ?? [],
    created_by: auth.user.id,
  };

  const { data, error } = await auth.supabase
    .from("b2b_conversation_entries")
    .insert(insertPayload)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (data?.id) {
    await logActivity(auth.supabase, {
      entity_type: "candidate",
      entity_id: id,
      action: "candidate.conversation_log",
      diff: { channel, message_preview: message.slice(0, 200) },
      created_by: auth.user.id,
    });
  }

  return NextResponse.json({ ok: true, id: data?.id }, { status: 201 });
}

