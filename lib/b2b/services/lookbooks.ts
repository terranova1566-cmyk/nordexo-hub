import type { SupabaseClient } from "@supabase/supabase-js";
import { logActivity } from "@/lib/b2b/services/activity-log";

export const listLookbooks = async (supabase: SupabaseClient) => {
  const { data, error } = await supabase
    .from("b2b_supplier_lookbooks")
    .select(
      "id, title, description, updated_at, supplier:b2b_suppliers(id, internal_name, platform), curated_for_customer:b2b_customers(id, name)"
    )
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);
  return (data ?? []) as any[];
};

export const getLookbook = async (supabase: SupabaseClient, id: string) => {
  const { data, error } = await supabase
    .from("b2b_supplier_lookbooks")
    .select(
      "id, title, description, created_at, updated_at, supplier_id, curated_for_customer_id, supplier:b2b_suppliers(id, internal_name, platform), curated_for_customer:b2b_customers(id, name)"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Lookbook not found.");
  return data as any;
};

export const listLookbookItems = async (supabase: SupabaseClient, lookbookId: string) => {
  const { data, error } = await supabase
    .from("b2b_supplier_lookbook_items")
    .select(
      "id, title, image_url, preview_price_cny, exposed_to_customer, position, product_candidate_id, created_at, updated_at, candidate:b2b_product_candidates(id, title, images, status)"
    )
    .eq("lookbook_id", lookbookId)
    .order("position", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);
  return (data ?? []) as any[];
};

export const createLookbook = async (
  supabase: SupabaseClient,
  input: {
    title: string;
    description?: string | null;
    supplier_id?: string | null;
    curated_for_customer_id?: string | null;
    created_by?: string | null;
  }
) => {
  const payload = {
    title: input.title.trim(),
    description: input.description ?? null,
    supplier_id: input.supplier_id ?? null,
    curated_for_customer_id: input.curated_for_customer_id ?? null,
    created_by: input.created_by ?? null,
  };

  const { data, error } = await supabase
    .from("b2b_supplier_lookbooks")
    .insert(payload)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("Failed to create lookbook.");

  await logActivity(supabase, {
    entity_type: "lookbook",
    entity_id: data.id,
    action: "lookbook.create",
    diff: payload,
    created_by: input.created_by ?? null,
  });

  return data.id as string;
};

export const updateLookbook = async (
  supabase: SupabaseClient,
  id: string,
  patch: { title?: string; description?: string | null },
  opts: { updated_by?: string | null } = {}
) => {
  const updates: Record<string, unknown> = {};
  if (typeof patch.title === "string") updates.title = patch.title.trim();
  if (patch.description !== undefined) updates.description = patch.description ?? null;

  const { data, error } = await supabase
    .from("b2b_supplier_lookbooks")
    .update(updates)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("Lookbook not found.");

  await logActivity(supabase, {
    entity_type: "lookbook",
    entity_id: id,
    action: "lookbook.update",
    diff: updates,
    created_by: opts.updated_by ?? null,
  });

  return true;
};

export const updateLookbookItem = async (
  supabase: SupabaseClient,
  itemId: string,
  patch: Partial<{
    title: string | null;
    image_url: string | null;
    preview_price_cny: number | null;
    exposed_to_customer: boolean;
    position: number | null;
  }>,
  opts: { updated_by?: string | null } = {}
) => {
  const updates: Record<string, unknown> = {};
  if (patch.title !== undefined) updates.title = patch.title ? String(patch.title).trim() : null;
  if (patch.image_url !== undefined) updates.image_url = patch.image_url ? String(patch.image_url).trim() : null;
  if (patch.preview_price_cny !== undefined) {
    updates.preview_price_cny =
      patch.preview_price_cny === null ? null : Number(patch.preview_price_cny);
  }
  if (patch.position !== undefined) {
    updates.position = patch.position === null ? null : Math.trunc(Number(patch.position));
  }
  if (typeof patch.exposed_to_customer === "boolean") {
    updates.exposed_to_customer = patch.exposed_to_customer;
  }

  const { data, error } = await supabase
    .from("b2b_supplier_lookbook_items")
    .update(updates)
    .eq("id", itemId)
    .select("id, lookbook_id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("Lookbook item not found.");

  await logActivity(supabase, {
    entity_type: "lookbook_item",
    entity_id: itemId,
    action: "lookbook_item.update",
    diff: updates,
    created_by: opts.updated_by ?? null,
  });

  // If a customer-visible toggle changes, also log at the lookbook level.
  if (Object.prototype.hasOwnProperty.call(updates, "exposed_to_customer")) {
    await logActivity(supabase, {
      entity_type: "lookbook",
      entity_id: data.lookbook_id,
      action: "lookbook.item_exposure_changed",
      diff: { item_id: itemId, exposed_to_customer: updates.exposed_to_customer },
      created_by: opts.updated_by ?? null,
    });
  }

  return true;
};

