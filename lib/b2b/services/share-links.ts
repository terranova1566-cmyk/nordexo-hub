import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { B2BShareLinkType, B2BSharePermission } from "@/lib/b2b/constants";
import { logActivity } from "@/lib/b2b/services/activity-log";

const normalizePermissions = (input: unknown): B2BSharePermission[] => {
  if (!Array.isArray(input)) return ["view"];
  const out = new Set<B2BSharePermission>();
  input.forEach((entry) => {
    const value = String(entry || "").trim();
    if (value === "view" || value === "select" || value === "comment") {
      out.add(value);
    }
  });
  out.add("view");
  return Array.from(out);
};

export const createShareLink = async (
  supabase: SupabaseClient,
  input: {
    type: B2BShareLinkType;
    entity_id: string;
    permissions?: B2BSharePermission[] | null;
    expires_at?: string | null;
    sanitized_view_config?: Record<string, unknown> | null;
    created_by?: string | null;
  }
) => {
  const token = crypto.randomBytes(18).toString("hex");
  const payload = {
    token,
    type: input.type,
    entity_id: input.entity_id,
    expires_at: input.expires_at ?? null,
    permissions: normalizePermissions(input.permissions),
    sanitized_view_config: input.sanitized_view_config ?? {},
    created_by: input.created_by ?? null,
  };

  const { data, error } = await supabase
    .from("b2b_share_links")
    .insert(payload)
    .select("id, token")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.id || !data?.token) throw new Error("Failed to create share link.");

  await logActivity(supabase, {
    entity_type: "share_link",
    entity_id: data.id,
    action: "share_link.create",
    diff: { ...payload, token: "[redacted]" },
    created_by: input.created_by ?? null,
  });

  return { id: data.id as string, token: data.token as string };
};

export const listShareLinksForEntity = async (
  supabase: SupabaseClient,
  input: { type: B2BShareLinkType; entity_id: string }
) => {
  const { data, error } = await supabase
    .from("b2b_share_links")
    .select(
      "id, token, type, entity_id, permissions, expires_at, created_at, revoked_at, last_accessed_at"
    )
    .eq("type", input.type)
    .eq("entity_id", input.entity_id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);
  return (data ?? []) as any[];
};

export const getShareLink = async (supabase: SupabaseClient, id: string) => {
  const { data, error } = await supabase
    .from("b2b_share_links")
    .select(
      "id, token, type, entity_id, permissions, expires_at, created_at, revoked_at, last_accessed_at, sanitized_view_config"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Share link not found.");
  return data as any;
};

export const listShareSelections = async (supabase: SupabaseClient, shareLinkId: string) => {
  const { data, error } = await supabase
    .from("b2b_customer_selections")
    .select(
      "id, share_link_id, external_user_session_id, selection_state, comment, created_at, updated_at, product_candidate_id, lookbook_item_id, candidate:b2b_product_candidates(id, title), lookbook_item:b2b_supplier_lookbook_items(id, title)"
    )
    .eq("share_link_id", shareLinkId)
    .order("updated_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);
  return (data ?? []) as any[];
};

