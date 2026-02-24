import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const escapeLikeToken = (value: string) => value.replace(/[%_]/g, "\\$&");

const VARIANT_SELECT =
  "id,draft_sku,draft_spu,draft_option1,draft_option2,draft_option3,draft_option4,draft_option_combined_zh,draft_price,draft_weight,draft_weight_unit,draft_variant_image_url,draft_status,draft_updated_at,draft_raw_row";

function getAdminClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const fetchSpusForRun = async (
  adminClient: any,
  run: string
) => {
  const prefix = `images/draft_products/${run}/`;
  const escapedPrefix = escapeLikeToken(prefix);
  const escapedAlt = escapeLikeToken(`${run}/`);
  const folderFilter = `draft_image_folder.like.${escapedPrefix}%,draft_image_folder.like.${escapedAlt}%`;

  const { data, error } = await adminClient
    .from("draft_products")
    .select("draft_spu")
    .eq("draft_status", "draft")
    .or(folderFilter);

  if (error) {
    throw new Error(error.message);
  }

  const spus = ((data ?? []) as any[])
    .map((row) => String(row?.draft_spu ?? "").trim())
    .filter((value): value is string => Boolean(value));

  return Array.from(new Set(spus));
};

const chunkArray = <T,>(list: T[], size: number) => {
  const out: T[][] = [];
  for (let index = 0; index < list.length; index += size) {
    out.push(list.slice(index, index + size));
  }
  return out;
};

export async function GET(request: Request) {
  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  const spu = searchParams.get("spu")?.trim();
  const run = searchParams.get("run")?.trim();
  const countOnlyRaw = searchParams.get("countOnly")?.trim().toLowerCase();
  const countOnly =
    countOnlyRaw === "1" || countOnlyRaw === "true" || countOnlyRaw === "yes";

  if (run && (run.includes("/") || run.includes("\\") || run.includes(".."))) {
    return NextResponse.json({ error: "Invalid run." }, { status: 400 });
  }

  let scopedSpus: string[] | null = null;
  if (run) {
    try {
      scopedSpus = await fetchSpusForRun(adminClient, run);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Unable to filter run SPUs." },
        { status: 500 }
      );
    }
  }

  if (scopedSpus && scopedSpus.length === 0) {
    return NextResponse.json({ items: [], count: 0 });
  }

  if (spu && scopedSpus && !scopedSpus.includes(spu)) {
    return NextResponse.json({ items: [], count: 0 });
  }

  if (run && !spu) {
    const chunks = chunkArray(scopedSpus ?? [], 300);
    if (countOnly) {
      let total = 0;
      for (const chunk of chunks) {
        let countQuery = adminClient
          .from("draft_variants")
          .select("id", { count: "exact", head: true })
          .eq("draft_status", "draft")
          .in("draft_spu", chunk);

        if (query) {
          const like = `%${query}%`;
          countQuery = countQuery.or(
            `draft_sku.ilike.${like},draft_spu.ilike.${like},draft_option_combined_zh.ilike.${like}`
          );
        }

        const { error, count } = await countQuery;
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        total += Number(count ?? 0);
      }
      return NextResponse.json({ count: total });
    }

    const aggregated: Array<Record<string, unknown>> = [];

    for (const chunk of chunks) {
      let queryBuilder = adminClient
        .from("draft_variants")
        .select(VARIANT_SELECT)
        .eq("draft_status", "draft")
        .in("draft_spu", chunk)
        .order("draft_spu", { ascending: true })
        .order("draft_sku", { ascending: true });

      if (query) {
        const like = `%${query}%`;
        queryBuilder = queryBuilder.or(
          `draft_sku.ilike.${like},draft_spu.ilike.${like},draft_option_combined_zh.ilike.${like}`
        );
      }

      const { data, error } = await queryBuilder;
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      aggregated.push(...(data ?? []));
    }

    const sorted = aggregated.sort((left, right) => {
      const leftSpu = String(left.draft_spu ?? "");
      const rightSpu = String(right.draft_spu ?? "");
      if (leftSpu !== rightSpu) return leftSpu.localeCompare(rightSpu);
      return String(left.draft_sku ?? "").localeCompare(String(right.draft_sku ?? ""));
    });

    return NextResponse.json({ items: sorted, count: sorted.length });
  }

  if (countOnly) {
    let countQuery = adminClient
      .from("draft_variants")
      .select("id", { count: "exact", head: true })
      .eq("draft_status", "draft");

    if (spu) {
      countQuery = countQuery.eq("draft_spu", spu);
    }

    if (query) {
      const like = `%${query}%`;
      countQuery = countQuery.or(
        `draft_sku.ilike.${like},draft_spu.ilike.${like},draft_option_combined_zh.ilike.${like}`
      );
    }

    const { error, count } = await countQuery;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ count: count ?? 0 });
  }

  let supabaseQuery = adminClient
    .from("draft_variants")
    .select(VARIANT_SELECT, { count: "exact" })
    .eq("draft_status", "draft")
    .order("draft_spu", { ascending: true })
    .order("draft_sku", { ascending: true });

  if (spu) {
    supabaseQuery = supabaseQuery.eq("draft_spu", spu);
  }

  if (query) {
    const like = `%${query}%`;
    supabaseQuery = supabaseQuery.or(
      `draft_sku.ilike.${like},draft_spu.ilike.${like},draft_option_combined_zh.ilike.${like}`
    );
  }

  const { data, error, count } = await supabaseQuery;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [], count: count ?? (data ?? []).length });
}
