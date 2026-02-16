import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { parseAmazonUrls } from "@/lib/amazon/urls";
import { scrapeAmazonListingCards } from "@/lib/amazon/scrape";
import { OxylabsError } from "@/lib/amazon/oxylabs";
import { AmazonScrapeError } from "@/lib/amazon/errors";

export const runtime = "nodejs";

const isTruthy = (value: unknown) => {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(normalized);
};

const parseNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const serializeSupabaseError = (err: any) => ({
  message: String(err?.message ?? ""),
  details: err?.details ?? null,
  hint: err?.hint ?? null,
  code: typeof err?.code === "string" ? err.code : null,
});

const isMissingTableError = (err: any, table?: string) => {
  const code = typeof err?.code === "string" ? err.code : "";
  const message = String(err?.message ?? "");
  if (code !== "PGRST205") return false;
  if (!message.toLowerCase().includes("could not find the table")) return false;
  if (!table) return true;
  return message.includes(`public.${table}`) || message.includes(table);
};

async function requireAdmin() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      supabase,
      user: null,
    };
  }

  const { data: settings, error: settingsError } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (settingsError) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: settingsError.message }, { status: 500 }),
      supabase,
      user: null,
    };
  }

  if (!settings?.is_admin) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      supabase,
      user: null,
    };
  }

  return { ok: true as const, supabase, user };
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const urls =
    Array.isArray(payload.urls)
      ? payload.urls.filter((v): v is string => typeof v === "string")
      : typeof payload.urls === "string"
        ? parseAmazonUrls(payload.urls)
        : typeof payload.search_urls === "string"
          ? parseAmazonUrls(payload.search_urls)
          : Array.isArray(payload.search_urls)
            ? payload.search_urls.filter((v): v is string => typeof v === "string")
            : [];

  if (urls.length === 0) {
    return NextResponse.json(
      { error: "Provide urls (array) or search_urls." },
      { status: 400 }
    );
  }

  const maxItems = Math.min(80, Math.max(1, Math.trunc(parseNumber(payload.max_items, 40))));
  const nowIso = new Date().toISOString();
  const providerRaw = typeof payload.provider === "string" ? payload.provider.trim() : "";
  const provider =
    providerRaw === "" || providerRaw.toLowerCase() === "oxylabs"
      ? "oxylabs"
      : providerRaw.toLowerCase() === "direct"
        ? "direct"
        : null;
  if (!provider) {
    return NextResponse.json(
      { error: "Invalid provider. Use 'oxylabs' or 'direct'." },
      { status: 400 }
    );
  }

  const persistToDb =
    payload.persist_to_db === undefined && payload.save_to_db === undefined
      ? true
      : isTruthy(payload.persist_to_db ?? payload.save_to_db);
  const returnCards = payload.return_cards === undefined ? false : isTruthy(payload.return_cards);

  const results: any[] = [];
  const errors: Array<{
    url: string;
    error: string;
    code?: string;
    provider?: string;
    detail?: unknown;
  }> = [];

  for (const url of urls) {
    try {
      const scraped = await scrapeAmazonListingCards(url, { maxItems, provider });
      const rows = scraped.cards.map((card) => ({
        user_id: auth.user.id,
        asin: card.asin,
        domain: card.domain,
        product_url: card.productUrl,
        title: card.title,
        image_url: card.imageUrl,
        price: card.price.amount,
        currency: card.price.currency,
        source_url: card.sourceUrl,
        source_type: card.sourceType,
        source_asin: card.sourceAsin,
        provider: card.provider,
        raw: card.raw ?? null,
        last_seen_at: nowIso,
      }));

      let persisted = false;
      let dbError: ReturnType<typeof serializeSupabaseError> | null = null;

      if (persistToDb) {
        if (rows.length > 0) {
          const upsert = await auth.supabase.from("amazon_product_cards").upsert(rows, {
            onConflict: "user_id,source_type,source_url,product_url",
          });
          if (upsert.error) {
            dbError = serializeSupabaseError(upsert.error);
            const missingTables = isMissingTableError(dbError, "amazon_product_cards")
              ? ["amazon_product_cards"]
              : [];
            errors.push({
              url,
              error: dbError.message || "Database write failed.",
              code: dbError.code ?? undefined,
              provider: "supabase",
              detail: {
                table: "amazon_product_cards",
                dbError,
                missingTables,
                hint:
                  missingTables.length > 0
                    ? "Missing Supabase tables for Amazon scrapes. Apply migration supabase/migrations/0043_amazon_scrapes.sql and then reload the PostgREST schema cache."
                    : null,
              },
            });
          } else {
            persisted = true;
          }
        } else {
          // Nothing to persist, but the scrape itself succeeded.
          persisted = true;
        }
      }

      results.push({
        url,
        domain: scraped.domain,
        asinCount: scraped.asins.length,
        cardCount: scraped.cards.length,
        persisted,
        cards: returnCards || !persistToDb || Boolean(dbError) ? scraped.cards : undefined,
      });
    } catch (err) {
      if (err instanceof OxylabsError) {
        errors.push({
          url,
          error: err.message,
          code: err.code,
          provider: "oxylabs",
          detail: err.detail ?? null,
        });
      } else if (err instanceof AmazonScrapeError) {
        errors.push({
          url,
          error: err.message,
          code: err.code,
          provider: err.provider,
          detail: err.detail ?? null,
        });
      } else {
        errors.push({ url, error: err instanceof Error ? err.message : "Scrape failed." });
      }
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    count: results.length,
    errorCount: errors.length,
    results,
    errors,
  });
}
