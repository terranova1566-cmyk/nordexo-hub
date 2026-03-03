import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

type StackItemRef = {
  provider?: unknown;
  product_id?: unknown;
};

type StackPayload = {
  items?: StackItemRef[];
  stack_id?: unknown;
};

type StackRow = {
  provider: string;
  product_id: string;
  stack_id: string;
};

const normalizeItem = (raw: StackItemRef) => {
  const provider = String(raw.provider ?? "").trim().toLowerCase();
  const product_id = String(raw.product_id ?? "").trim();
  if (!provider || !product_id) return null;
  if (provider !== "cdon" && provider !== "fyndiq") return null;
  return { provider, product_id };
};

const uniqueItems = (items: Array<{ provider: string; product_id: string }>) => {
  const seen = new Set<string>();
  const output: Array<{ provider: string; product_id: string }> = [];
  items.forEach((item) => {
    const key = `${item.provider}:${item.product_id}`;
    if (seen.has(key)) return;
    seen.add(key);
    output.push(item);
  });
  return output;
};

const fetchExistingRows = async (
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  items: Array<{ provider: string; product_id: string }>
) => {
  const byProvider = new Map<string, string[]>();
  items.forEach((item) => {
    const list = byProvider.get(item.provider) ?? [];
    list.push(item.product_id);
    byProvider.set(item.provider, list);
  });

  const rows: StackRow[] = [];
  for (const [provider, ids] of byProvider.entries()) {
    const { data, error } = await supabase
      .from("discovery_product_stack_items")
      .select("provider, product_id, stack_id")
      .eq("provider", provider)
      .in("product_id", ids);
    if (error) {
      throw new Error(error.message);
    }
    rows.push(...((data ?? []) as StackRow[]));
  }
  return rows;
};

const pruneSmallStacks = async (
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  stackIds: string[]
) => {
  const uniqueStackIds = Array.from(new Set(stackIds.filter(Boolean)));
  if (uniqueStackIds.length === 0) return;

  const { data: rows, error } = await supabase
    .from("discovery_product_stack_items")
    .select("stack_id")
    .in("stack_id", uniqueStackIds);
  if (error) {
    throw new Error(error.message);
  }

  const counts = new Map<string, number>();
  (rows as Array<{ stack_id: string }> | null)?.forEach((row) => {
    const key = String(row.stack_id ?? "").trim();
    if (!key) return;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  const toDelete = uniqueStackIds.filter((stackId) => (counts.get(stackId) ?? 0) < 2);
  if (toDelete.length === 0) return;

  const { error: deleteError } = await supabase
    .from("discovery_product_stack_items")
    .delete()
    .in("stack_id", toDelete);
  if (deleteError) {
    throw new Error(deleteError.message);
  }
};

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: StackPayload;
  try {
    payload = (await request.json()) as StackPayload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const normalized = uniqueItems(
    (payload.items ?? [])
      .map((row) => normalizeItem(row))
      .filter((row): row is { provider: string; product_id: string } => Boolean(row))
  );

  if (normalized.length < 2) {
    return NextResponse.json(
      { error: "Select at least two products to create or update a stack." },
      { status: 400 }
    );
  }

  let targetStackId = String(payload.stack_id ?? "").trim();
  const existingRows = await fetchExistingRows(supabase, normalized);
  const existingStackIds = Array.from(
    new Set(existingRows.map((row) => String(row.stack_id ?? "").trim()).filter(Boolean))
  );

  if (!targetStackId) {
    targetStackId =
      existingStackIds.length === 1 ? existingStackIds[0] : randomUUID();
  }

  const rowsToUpsert = normalized.map((item) => ({
    provider: item.provider,
    product_id: item.product_id,
    stack_id: targetStackId,
    created_by: user.id,
    updated_at: new Date().toISOString(),
  }));

  const { error: upsertError } = await supabase
    .from("discovery_product_stack_items")
    .upsert(rowsToUpsert, { onConflict: "provider,product_id" });

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  await pruneSmallStacks(supabase, [...existingStackIds, targetStackId]);

  const { count, error: countError } = await supabase
    .from("discovery_product_stack_items")
    .select("provider", { count: "exact", head: true })
    .eq("stack_id", targetStackId);

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  return NextResponse.json({
    stack_id: targetStackId,
    count: count ?? null,
  });
}

export async function DELETE(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: StackPayload;
  try {
    payload = (await request.json()) as StackPayload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const normalized = uniqueItems(
    (payload.items ?? [])
      .map((row) => normalizeItem(row))
      .filter((row): row is { provider: string; product_id: string } => Boolean(row))
  );

  if (normalized.length === 0) {
    return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  }

  const existingRows = await fetchExistingRows(supabase, normalized);
  if (existingRows.length === 0) {
    return NextResponse.json({ removed: 0 });
  }

  const stackIds = Array.from(
    new Set(existingRows.map((row) => String(row.stack_id ?? "").trim()).filter(Boolean))
  );

  const rowsToDelete = new Set(
    existingRows.map((row) => `${row.provider}:${row.product_id}`)
  );
  let removed = 0;

  for (const item of normalized) {
    const key = `${item.provider}:${item.product_id}`;
    if (!rowsToDelete.has(key)) continue;
    const { error } = await supabase
      .from("discovery_product_stack_items")
      .delete()
      .eq("provider", item.provider)
      .eq("product_id", item.product_id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    removed += 1;
  }

  await pruneSmallStacks(supabase, stackIds);

  return NextResponse.json({ removed });
}
