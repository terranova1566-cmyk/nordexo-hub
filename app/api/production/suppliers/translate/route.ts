import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Offer = {
  offerId?: string | number | null;
  subject?: string | null;
  subject_en?: string | null;
  [key: string]: unknown;
};

const hasCjk = (value: unknown) => /[\u3400-\u9fff]/.test(String(value || ""));
const asText = (value: unknown) =>
  value === null || value === undefined ? "" : String(value).trim();

const getAdminClient = () => {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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
    };
  }

  if (!settings?.is_admin) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true as const, user };
}

const extractJsonFromText = (text: string) => {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {}
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
};

const translateSingleSubjectBestEffort = async (
  apiKey: string,
  modelCandidates: string[],
  subject: string
) => {
  const source = asText(subject);
  if (!source) return "";

  const prompt = [
    "Translate this Chinese supplier product title into concise, natural English.",
    "Keep technical attributes, remove hype, max 120 characters.",
    "Return JSON only with format: { \"english_title\": \"...\" }",
    "",
    `Title: ${source}`,
  ].join("\n");

  for (const model of modelCandidates) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });
      if (!response.ok) continue;
      const result = await response.json().catch(() => null);
      const parsed = extractJsonFromText(String(result?.choices?.[0]?.message?.content || ""));
      const translated = asText(
        parsed?.english_title ||
          parsed?.englishTitle ||
          parsed?.title_en ||
          parsed?.translation ||
          parsed?.english
      ).slice(0, 120);
      if (translated) return translated;
    } catch {
      // try next model
    } finally {
      clearTimeout(timeout);
    }
  }
  return "";
};

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  const payload = await request.json().catch(() => null);
  if (!payload) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const provider = String(payload?.provider ?? "").trim().toLowerCase();
  const productId = String(payload?.product_id ?? "").trim();
  if (!provider || !productId) {
    return NextResponse.json({ error: "Missing identifiers." }, { status: 400 });
  }

  const { data: searchRow, error: searchError } = await adminClient
    .from("discovery_production_supplier_searches")
    .select("offers")
    .eq("provider", provider)
    .eq("product_id", productId)
    .maybeSingle();

  if (searchError) {
    return NextResponse.json({ error: searchError.message }, { status: 500 });
  }

  const offers: Offer[] = Array.isArray((searchRow as any)?.offers)
    ? ((searchRow as any).offers as Offer[])
    : [];

  if (offers.length === 0) {
    return NextResponse.json({ offers });
  }

  const offersToTranslate = offers.filter((offer) => {
    const subject = asText(offer?.subject);
    const existingEn = asText(offer?.subject_en);
    if (!subject || !hasCjk(subject)) return false;
    return !existingEn || hasCjk(existingEn);
  });

  if (offersToTranslate.length === 0) {
    return NextResponse.json({ offers });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Best-effort feature; keep UI functional even without translation.
    return NextResponse.json({ offers });
  }

  const modelCandidates = Array.from(
    new Set(
      [
        "gpt-4o-mini",
        process.env.SUPPLIER_TRANSLATE_MODEL,
        "gpt-5-mini",
        process.env.OPENAI_EDIT_MODEL,
      ]
        .map((value) => asText(value))
        .filter(Boolean)
    )
  );

  const limitedOffers = offersToTranslate.slice(0, 20).map((offer, index) => ({
    idx: index + 1,
    offer_id: asText(offer?.offerId) || null,
    subject: asText(offer?.subject),
  }));

  const prompt = [
    "Translate Chinese supplier product titles into concise, natural English.",
    "Remove marketing words, hype, and unrelated selling language.",
    "Keep practical usage and core product nouns.",
    "Keep meaningful technical attributes such as material, dimensions, model, and pack details.",
    "Do not add brand claims or promotional copy.",
    "Maximum 120 characters per translated title.",
    "Return JSON only.",
    'Return format: { "items": [ { "offer_id": "...", "subject": "...", "english_title": "..." } ] }',
    "",
    "Input JSON:",
    JSON.stringify(limitedOffers, null, 2),
  ].join("\n");

  let parsed: any = null;
  for (const model of modelCandidates) {
    const bodyPayload: Record<string, unknown> = {
      model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(bodyPayload),
        signal: controller.signal,
      });
      if (!response.ok) continue;
      const result = await response.json().catch(() => null);
      const content = result?.choices?.[0]?.message?.content || "";
      parsed = extractJsonFromText(String(content));
      if (parsed) break;
    } catch {
      // try next model
    } finally {
      clearTimeout(timeout);
    }
  }
  if (!parsed) return NextResponse.json({ offers });

  const mapByOfferId = new Map<string, string>();
  const mapBySubject = new Map<string, string>();
  const items = Array.isArray((parsed as any)?.items) ? (parsed as any).items : [];
  items.forEach((row: any, idx: number) => {
    const subject = asText(row?.subject) || asText(limitedOffers[idx]?.subject);
    const offerId = asText(row?.offer_id) || asText(limitedOffers[idx]?.offer_id);

    const englishCandidate =
      (typeof row?.english_title === "string" && row.english_title.trim()) ||
      (typeof row?.englishTitle === "string" && row.englishTitle.trim()) ||
      (typeof row?.title_en === "string" && row.title_en.trim()) ||
      (typeof row?.translation === "string" && row.translation.trim()) ||
      (typeof row?.english === "string" && row.english.trim()) ||
      "";

    const english = typeof englishCandidate === "string" ? englishCandidate.trim() : "";
    if (!english) return;
    if (offerId) mapByOfferId.set(offerId, english.slice(0, 120));
    if (subject) mapBySubject.set(subject, english.slice(0, 120));
  });

  const unresolved = limitedOffers.filter((offer) => {
    const subject = asText(offer.subject);
    const offerId = asText(offer.offer_id);
    if (!subject) return false;
    if (offerId && mapByOfferId.has(offerId)) return false;
    return !mapBySubject.has(subject);
  });
  for (const row of unresolved) {
    const subject = asText(row.subject);
    if (!subject) continue;
    const fallbackTranslated = await translateSingleSubjectBestEffort(
      apiKey,
      modelCandidates,
      subject
    );
    if (!fallbackTranslated) continue;
    const offerId = asText(row.offer_id);
    if (offerId) mapByOfferId.set(offerId, fallbackTranslated.slice(0, 120));
    mapBySubject.set(subject, fallbackTranslated.slice(0, 120));
  }

  if (mapByOfferId.size === 0 && mapBySubject.size === 0) {
    return NextResponse.json({ offers });
  }

  const updatedOffers = offers.map((offer) => {
    const subject = asText(offer?.subject);
    const offerId = asText(offer?.offerId);
    if (!subject) return offer;
    const translated = (offerId && mapByOfferId.get(offerId)) || mapBySubject.get(subject);
    return translated ? { ...offer, subject_en: translated.slice(0, 120) } : offer;
  });

  const { error: upsertError } = await adminClient
    .from("discovery_production_supplier_searches")
    .upsert(
      {
        provider,
        product_id: productId,
        offers: updatedOffers,
      },
      { onConflict: "provider,product_id" }
    );

  if (upsertError) {
    // Still return translated offers to the UI even if persistence failed.
    return NextResponse.json({ offers: updatedOffers });
  }

  return NextResponse.json({ offers: updatedOffers });
}
