import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getServiceSupabase } from "@/lib/b2b/server/admin";
import { B2B_SELECTION_STATES } from "@/lib/b2b/constants";

export const runtime = "nodejs";

const isSelectionState = (value: string) =>
  (B2B_SELECTION_STATES as readonly string[]).includes(value);

const newSessionId = () => crypto.randomUUID();

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const admin = getServiceSupabase();
  if (!admin) {
    return NextResponse.json(
      { error: "Server is missing Supabase service role credentials." },
      { status: 500 }
    );
  }

  const { token } = await context.params;
  const cleanToken = String(token || "").trim();
  if (!cleanToken) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  const { data: link, error: linkError } = await admin
    .from("b2b_share_links")
    .select("id, token, type, entity_id, permissions, expires_at, revoked_at")
    .eq("token", cleanToken)
    .maybeSingle();

  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 500 });
  }
  if (!link?.id || link.revoked_at) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "Link expired." }, { status: 404 });
  }

  const permissions = (link.permissions ?? ["view"]) as string[];
  if (!permissions.includes("select") && !permissions.includes("comment")) {
    return NextResponse.json({ error: "Selections disabled." }, { status: 403 });
  }

  let payload: any = null;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const productCandidateId =
    typeof payload?.product_candidate_id === "string"
      ? payload.product_candidate_id.trim()
      : null;
  const lookbookItemId =
    typeof payload?.lookbook_item_id === "string" ? payload.lookbook_item_id.trim() : null;

  if (!productCandidateId && !lookbookItemId) {
    return NextResponse.json(
      { error: "Provide product_candidate_id or lookbook_item_id." },
      { status: 400 }
    );
  }
  if (productCandidateId && lookbookItemId) {
    return NextResponse.json(
      { error: "Provide only one item id (product_candidate_id OR lookbook_item_id)." },
      { status: 400 }
    );
  }

  const selectionStateRaw =
    typeof payload?.selection_state === "string" ? payload.selection_state.trim() : "selected";
  const selectionState = isSelectionState(selectionStateRaw) ? selectionStateRaw : "selected";

  const comment =
    typeof payload?.comment === "string" ? payload.comment.trim().slice(0, 2000) : null;

  // External user session (cookie-backed).
  const cookieStore = await cookies();
  const existingSession = cookieStore.get("nx_b2b_share_session")?.value ?? null;
  const sessionId = existingSession || newSessionId();

  const response = NextResponse.json({ ok: true, session_id: sessionId });
  if (!existingSession) {
    response.cookies.set({
      name: "nx_b2b_share_session",
      value: sessionId,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  // TODO: add light rate limiting if we introduce a shared edge/cache layer.
  const base = {
    share_link_id: link.id,
    external_user_session_id: sessionId,
    selection_state: selectionState,
    comment,
  };

  // Manual upsert (Supabase upsert does not play nicely with partial unique indexes).
  if (productCandidateId) {
    const { data: existing } = await admin
      .from("b2b_customer_selections")
      .select("id")
      .eq("share_link_id", link.id)
      .eq("external_user_session_id", sessionId)
      .eq("product_candidate_id", productCandidateId)
      .maybeSingle();

    if (existing?.id) {
      await admin
        .from("b2b_customer_selections")
        .update(base)
        .eq("id", existing.id);
    } else {
      await admin.from("b2b_customer_selections").insert({
        ...base,
        product_candidate_id: productCandidateId,
      });
    }
  } else if (lookbookItemId) {
    const { data: existing } = await admin
      .from("b2b_customer_selections")
      .select("id")
      .eq("share_link_id", link.id)
      .eq("external_user_session_id", sessionId)
      .eq("lookbook_item_id", lookbookItemId)
      .maybeSingle();

    if (existing?.id) {
      await admin
        .from("b2b_customer_selections")
        .update(base)
        .eq("id", existing.id);
    } else {
      await admin.from("b2b_customer_selections").insert({
        ...base,
        lookbook_item_id: lookbookItemId,
      });
    }
  }

  // Activity log: tied to share_link (no auth user).
  await admin.from("b2b_activity_log").insert({
    entity_type: "share_link",
    entity_id: link.id,
    action: "share_link.selection",
    diff: {
      item: productCandidateId
        ? { type: "product_candidate", id: productCandidateId }
        : { type: "lookbook_item", id: lookbookItemId },
      selection_state: selectionState,
      has_comment: Boolean(comment),
    },
    created_by: null,
  });

  return response;
}

