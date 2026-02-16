import { NextResponse } from "next/server";
import { requireB2BInternal } from "@/lib/b2b/server/auth";
import { createShareLink, listShareLinksForEntity } from "@/lib/b2b/services/share-links";
import { B2B_SHARE_LINK_TYPES } from "@/lib/b2b/constants";

export const runtime = "nodejs";

const isShareType = (value: string) =>
  (B2B_SHARE_LINK_TYPES as readonly string[]).includes(value);

export async function GET(request: Request) {
  const auth = await requireB2BInternal();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const type = (searchParams.get("type") ?? "").trim();
  const entityId = (searchParams.get("entityId") ?? "").trim();

  if (!type || !entityId || !isShareType(type)) {
    return NextResponse.json(
      { error: "Provide type (lookbook|project|product) and entityId." },
      { status: 400 }
    );
  }

  try {
    const items = await listShareLinksForEntity(auth.supabase, {
      type: type as any,
      entity_id: entityId,
    });
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unable to load share links." },
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

  const type = typeof payload?.type === "string" ? payload.type.trim() : "";
  const entityId = typeof payload?.entity_id === "string" ? payload.entity_id.trim() : "";
  const permissions = Array.isArray(payload?.permissions) ? payload.permissions : null;
  const expiresAt = typeof payload?.expires_at === "string" ? payload.expires_at : null;

  if (!type || !isShareType(type)) {
    return NextResponse.json({ error: "Invalid type." }, { status: 400 });
  }
  if (!entityId) {
    return NextResponse.json({ error: "Missing entity_id." }, { status: 400 });
  }

  try {
    const created = await createShareLink(auth.supabase, {
      type: type as any,
      entity_id: entityId,
      permissions,
      expires_at: expiresAt,
      sanitized_view_config:
        payload?.sanitized_view_config && typeof payload.sanitized_view_config === "object"
          ? payload.sanitized_view_config
          : null,
      created_by: auth.user.id,
    });

    return NextResponse.json({ ok: true, ...created }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unable to create share link." },
      { status: 500 }
    );
  }
}

