import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { parseAmazonUrls } from "@/lib/amazon/urls";
import { scrapeAmazonProductFull } from "@/lib/amazon/scrape";
import { OxylabsError } from "@/lib/amazon/oxylabs";
import { AmazonScrapeError } from "@/lib/amazon/errors";
import { downloadAmazonScrapeImages } from "@/lib/amazon/download-images";

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
        : typeof payload.product_urls === "string"
          ? parseAmazonUrls(payload.product_urls)
          : Array.isArray(payload.product_urls)
            ? payload.product_urls.filter((v): v is string => typeof v === "string")
            : [];

  if (urls.length === 0) {
    return NextResponse.json(
      { error: "Provide urls (array) or product_urls." },
      { status: 400 }
    );
  }

  const includeVariantImages =
    payload.include_variant_images === undefined
      ? true
      : isTruthy(payload.include_variant_images);
  const includeRelatedProducts =
    payload.include_related_products === undefined
      ? true
      : isTruthy(payload.include_related_products);
  const maxRelated = parseNumber(payload.max_related, 24);
  const downloadImages =
    payload.download_images === undefined ? false : isTruthy(payload.download_images);
  const persistToDb =
    payload.persist_to_db === undefined && payload.save_to_db === undefined
      ? true
      : isTruthy(payload.persist_to_db ?? payload.save_to_db);
  const returnScraped =
    payload.return_scraped === undefined ? false : isTruthy(payload.return_scraped);

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

  const nowIso = new Date().toISOString();
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
      const scraped = await scrapeAmazonProductFull(url, {
        provider,
        includeVariantImages,
        includeRelatedProducts,
        maxRelated,
      });

      const downloaded = downloadImages
        ? await downloadAmazonScrapeImages({
            asin: scraped.asin,
            mainImages: scraped.images,
            variants: scraped.variants.map((v) => ({ asin: v.asin, images: v.images })),
          })
        : null;

      let fullRow: any = null;
      const dbErrors: Array<{
        table: string;
        error: ReturnType<typeof serializeSupabaseError>;
      }> = [];

      if (persistToDb) {
        const upsertFull = await auth.supabase
          .from("amazon_full_scrapes")
          .upsert(
            {
              user_id: auth.user.id,
              asin: scraped.asin,
              domain: scraped.domain,
              product_url: scraped.productUrl,
              title: scraped.title,
              brand: scraped.brand,
              price: scraped.price.amount,
              currency: scraped.price.currency,
              description: scraped.description,
              bullet_points: scraped.bulletPoints,
              images: scraped.images,
              variants: scraped.variants,
              related_product_asins: scraped.relatedProductAsins,
              related_product_cards: scraped.relatedProductCards,
              provider: scraped.provider,
              raw: { product: scraped.raw ?? null, downloaded_images: downloaded },
              scraped_at: nowIso,
              updated_at: nowIso,
            },
            { onConflict: "user_id,asin" }
          )
          .select("id, asin, product_url, scraped_at")
          .maybeSingle();

        if (upsertFull.error) {
          dbErrors.push({
            table: "amazon_full_scrapes",
            error: serializeSupabaseError(upsertFull.error),
          });
        } else {
          fullRow = upsertFull.data ?? null;
        }

        if (scraped.relatedProductCards.length > 0) {
          const cardRows = scraped.relatedProductCards.map((card) => ({
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

          const upsertCards = await auth.supabase
            .from("amazon_product_cards")
            .upsert(cardRows, {
              onConflict: "user_id,source_type,source_url,product_url",
            });
          if (upsertCards.error) {
            dbErrors.push({
              table: "amazon_product_cards",
              error: serializeSupabaseError(upsertCards.error),
            });
          }
        }
      }

      if (dbErrors.length > 0) {
        const missingTables = dbErrors
          .filter((entry) => isMissingTableError(entry.error, entry.table))
          .map((entry) => entry.table);
        errors.push({
          url,
          error: dbErrors[0]?.error?.message || "Database write failed.",
          code: dbErrors[0]?.error?.code ?? undefined,
          provider: "supabase",
          detail: {
            dbErrors,
            missingTables,
            hint:
              missingTables.length > 0
                ? "Missing Supabase tables for Amazon scrapes. Apply migration supabase/migrations/0043_amazon_scrapes.sql and then reload the PostgREST schema cache."
                : null,
          },
        });
      }

      results.push({
        url,
        asin: scraped.asin,
        title: scraped.title,
        productUrl: scraped.productUrl,
        persisted: persistToDb && dbErrors.length === 0,
        full: fullRow,
        relatedCount: scraped.relatedProductCards.length,
        variantCount: scraped.variants.length,
        downloadedImages: downloadImages ? (downloaded?.main?.length ?? 0) : 0,
        scraped: returnScraped || !persistToDb || dbErrors.length > 0 ? scraped : undefined,
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
