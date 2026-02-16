import { NextResponse } from "next/server";
import { requireB2BInternal } from "@/lib/b2b/server/auth";
import { logActivity } from "@/lib/b2b/services/activity-log";
import { B2B_ENTITY_TYPES } from "@/lib/b2b/constants";

export const runtime = "nodejs";

const isEntityType = (value: string) =>
  (B2B_ENTITY_TYPES as readonly string[]).includes(value);

export async function GET(request: Request) {
  const auth = await requireB2BInternal();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const entityType = (searchParams.get("entityType") ?? "").trim();
  const entityId = (searchParams.get("entityId") ?? "").trim();

  if (!entityType || !entityId || !isEntityType(entityType)) {
    return NextResponse.json(
      { error: "Provide entityType and entityId." },
      { status: 400 }
    );
  }

  const { data, error } = await auth.supabase
    .from("b2b_notes")
    .select("id, entity_type, entity_id, note, created_at, created_by")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
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

  const entityType = typeof payload?.entity_type === "string" ? payload.entity_type.trim() : "";
  const entityId = typeof payload?.entity_id === "string" ? payload.entity_id.trim() : "";
  const note = typeof payload?.note === "string" ? payload.note.trim() : "";

  if (!entityType || !isEntityType(entityType)) {
    return NextResponse.json({ error: "Invalid entity_type." }, { status: 400 });
  }
  if (!entityId) {
    return NextResponse.json({ error: "Missing entity_id." }, { status: 400 });
  }
  if (!note) {
    return NextResponse.json({ error: "Missing note." }, { status: 400 });
  }

  const insertPayload = {
    entity_type: entityType,
    entity_id: entityId,
    note,
    created_by: auth.user.id,
  };

  const { data, error } = await auth.supabase
    .from("b2b_notes")
    .insert(insertPayload)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (data?.id) {
    await logActivity(auth.supabase, {
      entity_type: entityType as any,
      entity_id: entityId,
      action: "note.create",
      diff: { note_preview: note.slice(0, 200) },
      created_by: auth.user.id,
    });
  }

  return NextResponse.json({ ok: true, id: data?.id }, { status: 201 });
}

