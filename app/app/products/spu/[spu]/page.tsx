import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

type Props = {
  params: { spu: string };
};

type ProductSpuRow = {
  id: string;
  spu: string | null;
  updated_at: string | null;
};

const normalizeSpu = (value: string | null | undefined) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

export default async function ProductSpuRedirectPage({ params }: Props) {
  const raw = typeof params?.spu === "string" ? params.spu : "";
  const decoded = (() => {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  })();
  const spu = decoded.trim().toUpperCase();
  const fallback = `/app/products?q=${encodeURIComponent(spu)}`;

  if (!spu) {
    redirect("/app/products");
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      `/login?redirectedFrom=${encodeURIComponent(`/app/products/spu/${spu}`)}`
    );
  }

  const { data: exactRows } = await supabase
    .from("catalog_products")
    .select("id, spu, updated_at")
    .eq("spu", spu)
    .order("updated_at", { ascending: false })
    .limit(10);

  const pickExactMatch = (rows: ProductSpuRow[] | null | undefined) => {
    if (!rows || rows.length === 0) return null;
    const exact = rows.find((row) => normalizeSpu(row.spu) === spu);
    return exact?.id ?? rows[0]?.id ?? null;
  };

  let resolvedId = pickExactMatch(exactRows as ProductSpuRow[] | null | undefined);

  if (!resolvedId) {
    const { data: ciRows } = await supabase
      .from("catalog_products")
      .select("id, spu, updated_at")
      .ilike("spu", spu)
      .order("updated_at", { ascending: false })
      .limit(10);
    resolvedId = pickExactMatch(ciRows as ProductSpuRow[] | null | undefined);
  }

  if (!resolvedId) {
    const { data: containsRows } = await supabase
      .from("catalog_products")
      .select("id, spu, updated_at")
      .ilike("spu", `%${spu}%`)
      .order("updated_at", { ascending: false })
      .limit(25);
    resolvedId = pickExactMatch(containsRows as ProductSpuRow[] | null | undefined);
  }

  if (!resolvedId) {
    redirect(fallback);
  }

  redirect(`/app/products/${resolvedId}`);
}
