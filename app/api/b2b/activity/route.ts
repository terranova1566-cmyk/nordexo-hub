import { NextResponse } from "next/server";
import { requireB2BInternal } from "@/lib/b2b/server/auth";
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
  const limit = Math.max(
    1,
    Math.min(300, Math.trunc(Number(searchParams.get("limit") ?? "100")))
  );

  let query = auth.supabase
    .from("b2b_activity_log")
    .select("id, entity_type, entity_id, action, diff, created_at, created_by")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (entityType && entityId) {
    if (!isEntityType(entityType)) {
      return NextResponse.json({ error: "Invalid entityType." }, { status: 400 });
    }
    query = query.eq("entity_type", entityType).eq("entity_id", entityId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}

