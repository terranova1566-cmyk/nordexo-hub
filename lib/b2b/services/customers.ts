import type { SupabaseClient } from "@supabase/supabase-js";
import { logActivity } from "@/lib/b2b/services/activity-log";

export type CustomerRow = {
  id: string;
  name: string;
  main_currency: string;
  contacts: unknown;
  org_info: unknown;
  created_at: string;
  updated_at: string;
};

export const listCustomers = async (supabase: SupabaseClient) => {
  const { data, error } = await supabase
    .from("b2b_customers")
    .select("id, name, main_currency, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);
  return (data ?? []) as Array<
    Pick<CustomerRow, "id" | "name" | "main_currency" | "created_at" | "updated_at">
  >;
};

export const getCustomer = async (supabase: SupabaseClient, id: string) => {
  const { data, error } = await supabase
    .from("b2b_customers")
    .select("id, name, main_currency, contacts, org_info, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Customer not found.");
  return data as CustomerRow;
};

export const createCustomer = async (
  supabase: SupabaseClient,
  input: { name: string; main_currency?: string | null; created_by?: string | null }
) => {
  const payload = {
    name: input.name.trim(),
    main_currency: input.main_currency?.trim() || "SEK",
    created_by: input.created_by ?? null,
  };

  const { data, error } = await supabase
    .from("b2b_customers")
    .insert(payload)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("Failed to create customer.");

  await logActivity(supabase, {
    entity_type: "customer",
    entity_id: data.id,
    action: "customer.create",
    diff: payload,
    created_by: input.created_by ?? null,
  });

  return data.id as string;
};

export const updateCustomer = async (
  supabase: SupabaseClient,
  id: string,
  patch: Partial<Pick<CustomerRow, "name" | "main_currency" | "contacts" | "org_info">>,
  opts: { updated_by?: string | null } = {}
) => {
  const updates: Record<string, unknown> = {};
  if (typeof patch.name === "string") updates.name = patch.name.trim();
  if (typeof patch.main_currency === "string") {
    updates.main_currency = patch.main_currency.trim() || "SEK";
  }
  if (patch.contacts !== undefined) updates.contacts = patch.contacts;
  if (patch.org_info !== undefined) updates.org_info = patch.org_info;

  const { data, error } = await supabase
    .from("b2b_customers")
    .update(updates)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("Customer not found.");

  await logActivity(supabase, {
    entity_type: "customer",
    entity_id: id,
    action: "customer.update",
    diff: updates,
    created_by: opts.updated_by ?? null,
  });

  return true;
};

