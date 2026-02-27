import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { spawn } from "node:child_process";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { DRAFT_ROOT, resolveDraftPath } from "@/lib/drafts";
import { saveStoredLensSearchRecordForImagePath } from "@/lib/draft-google-lens-search-store";
import { getPublicBaseUrlFromRequest } from "@/shared/1688/image-search-runner";

export const runtime = "nodejs";

const DEFAULT_LENS_SERVICE_URLS = [
  "http://127.0.0.1:3400",
  "http://localhost:3400",
  "http://127.0.0.1:3100",
  "http://localhost:3100",
];
const SEARCH_ENDPOINT = "/api/google-lens/search";
const HISTORY_ENDPOINT = "/api/google-lens/history";
const HISTORY_RAW_TEMPLATE = "/api/google-lens/history/:id/raw";
const REQUEST_TIMEOUT_MS = 90_000;
const PUBLIC_TEMP_DIR = "/srv/incoming-scripts/uploads/public-temp-images";
const PUBLIC_TEMP_TTL_DAYS = 30;
const PUBLIC_TEMP_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
const LENS_SEARCH_DEFAULT_LIMIT = 80;
const LENS_SEARCH_MIN_LIMIT = 7;
const LENS_SEARCH_MAX_LIMIT = 120;
const LENS_SEARCH_TYPES = new Set([
  "all",
  "about_this_image",
  "products",
  "exact_matches",
  "visual_matches",
]);
const LOCAL_LENS_SERVICE_DIR = "/srv/SerpApi/google-lens";
const LENS_BOOTSTRAP_WAIT_MS = 1_200;
const LENS_BOOTSTRAP_COOLDOWN_MS = 20_000;

let lensServiceBootInFlight: Promise<void> | null = null;
let lastLensServiceBootStartedAt = 0;

type LensSearchResultItem = {
  rank: number;
  source: string | null;
  websiteName: string | null;
  title: string | null;
  link: string | null;
  thumbnail: string | null;
  image: string | null;
  sourceIcon: string | null;
  sourceDomain: string | null;
  exactMatches: unknown[] | null;
  serpapiExactMatchesLink: string | null;
  metadata: Record<string, unknown> | null;
  domain: string | null;
  isAmazon: boolean;
  bucket: "visualMatches";
  originalImage: string | null;
  originalWidth: number | null;
  originalHeight: number | null;
};

const VALID_PROTOCOLS = new Set(["http:", "https:"]);

const parseBoolean = (value: unknown) => {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return undefined;
};

const safeJsonParse = (value: string) => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

const toServiceUrls = () => {
  const configuredRaw = String(
    process.env.GOOGLE_LENS_SERVICE_URL || process.env.GOOGLE_REVERSE_IMAGE_SERVICE_URL || ""
  ).trim();
  const configured = configuredRaw
    .split(",")
    .map((value) => String(value || "").trim().replace(/\/+$/, ""))
    .filter(Boolean);
  const defaults = DEFAULT_LENS_SERVICE_URLS.map((value) =>
    value.replace(/\/+$/, "")
  );
  return Array.from(new Set([...configured, ...defaults]));
};

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const maybeBootLocalLensService = async (serviceBaseUrls: string[]) => {
  const supportsLocalBoot = serviceBaseUrls.some((baseUrl) => {
    try {
      const parsed = new URL(baseUrl);
      const host = parsed.hostname.toLowerCase();
      return host === "127.0.0.1" || host === "localhost";
    } catch {
      return false;
    }
  });
  if (!supportsLocalBoot) return;

  if (
    Date.now() - lastLensServiceBootStartedAt < LENS_BOOTSTRAP_COOLDOWN_MS &&
    lensServiceBootInFlight
  ) {
    await lensServiceBootInFlight;
    return;
  }

  lastLensServiceBootStartedAt = Date.now();
  lensServiceBootInFlight = (async () => {
    try {
      const serverPath = path.join(LOCAL_LENS_SERVICE_DIR, "src", "server.js");
      await fs.access(serverPath);
      const child = spawn(process.execPath, ["src/server.js"], {
        cwd: LOCAL_LENS_SERVICE_DIR,
        detached: true,
        stdio: "ignore",
      });
      child.unref();
    } catch {
      // Best effort.
    }
    await wait(LENS_BOOTSTRAP_WAIT_MS);
  })();

  try {
    await lensServiceBootInFlight;
  } finally {
    lensServiceBootInFlight = null;
  }
};

const inferMimeType = (filePath: string) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".bmp") return "image/bmp";
  if (ext === ".avif") return "image/avif";
  if (ext === ".tif" || ext === ".tiff") return "image/tiff";
  return "image/jpeg";
};

const ensureAbsoluteDraftImagePath = async (relativePath: string) => {
  const resolved = resolveDraftPath(relativePath);
  if (!resolved) {
    throw new Error("Invalid draft image path.");
  }
  const normalizedRoot = `${DRAFT_ROOT}${path.sep}`;
  if (!resolved.startsWith(normalizedRoot)) {
    throw new Error("Image path is outside draft root.");
  }
  const stat = await fs.stat(resolved);
  if (!stat.isFile()) {
    throw new Error("Provided path is not a file.");
  }
  return resolved;
};

const ensurePublicTempImageUrl = async (request: Request, relativePath: string) => {
  const absolutePath = await ensureAbsoluteDraftImagePath(relativePath);
  const ext = path.extname(absolutePath).replace(/^\./, "").toLowerCase();
  if (!PUBLIC_TEMP_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported image format ".${ext}" for Google Lens exposure.`);
  }

  const stat = await fs.stat(absolutePath);
  const contentHash = crypto
    .createHash("sha256")
    .update(`${relativePath}|${stat.size}|${stat.mtimeMs}`)
    .digest("hex")
    .slice(0, 32);

  const fileName = `${contentHash}.${ext}`;
  const targetPath = path.join(PUBLIC_TEMP_DIR, fileName);
  const metaPath = path.join(PUBLIC_TEMP_DIR, `${contentHash}.json`);

  await fs.mkdir(PUBLIC_TEMP_DIR, { recursive: true });
  try {
    await fs.access(targetPath);
  } catch {
    await fs.copyFile(absolutePath, targetPath);
  }

  const expiresAt = new Date(
    Date.now() + PUBLIC_TEMP_TTL_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  await fs.writeFile(
    metaPath,
    JSON.stringify(
      {
        expiresAt,
        source: "draft-google-lens-search",
        sourceDraftPath: relativePath,
        contentType: inferMimeType(absolutePath),
      },
      null,
      2
    ),
    "utf8"
  );

  const publicBaseUrl = getPublicBaseUrlFromRequest(request);
  if (!publicBaseUrl) {
    throw new Error("Unable to resolve public base URL for Google Lens search.");
  }
  return `${publicBaseUrl}/api/public/temp-images/${fileName}`;
};

const normalizeExternalImageUrl = (value: unknown) => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    if (!VALID_PROTOCOLS.has(parsed.protocol)) return "";
    return parsed.toString();
  } catch {
    return "";
  }
};

const clampResultLimit = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return LENS_SEARCH_DEFAULT_LIMIT;
  const rounded = Math.round(numeric);
  if (rounded < LENS_SEARCH_MIN_LIMIT) return LENS_SEARCH_MIN_LIMIT;
  if (rounded > LENS_SEARCH_MAX_LIMIT) return LENS_SEARCH_MAX_LIMIT;
  return rounded;
};

const isYouTubeHost = (value: string | null) => {
  if (!value) return false;
  try {
    const host = new URL(value).hostname.toLowerCase();
    return (
      host === "youtube.com" ||
      host === "www.youtube.com" ||
      host === "m.youtube.com" ||
      host.endsWith(".youtube.com") ||
      host === "youtu.be" ||
      host.endsWith(".youtu.be")
    );
  } catch {
    return false;
  }
};

const toStringOrNull = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
};

const toNumberOrNull = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const parseDomain = (value: string | null) => {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
};

const isAmazonDomain = (domain: string | null) => {
  if (!domain) return false;
  return domain === "amazon.com" || domain.endsWith(".amazon.com") || domain.includes("amazon.");
};

const normalizeVisualMatches = (items: unknown) => {
  if (!Array.isArray(items)) return [] as LensSearchResultItem[];
  return items
    .map((row, index) => {
      const item = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
      const link = toStringOrNull(item.link);
      const sourceDomain =
        toStringOrNull(item.sourceDomain) ||
        toStringOrNull(item.source_domain) ||
        parseDomain(link);
      const image =
        toStringOrNull(item.image) || toStringOrNull(item.originalImage) || null;
      const thumbnail = toStringOrNull(item.thumbnail);
      const rank = toNumberOrNull(item.rank ?? item.position) ?? index + 1;
      const exactMatches = Array.isArray(item.exactMatches)
        ? (item.exactMatches as unknown[])
        : null;
      const metadata =
        item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
          ? (item.metadata as Record<string, unknown>)
          : null;
      return {
        rank,
        source: toStringOrNull(item.source),
        websiteName: toStringOrNull(item.websiteName),
        title: toStringOrNull(item.title),
        link,
        thumbnail,
        image,
        sourceIcon: toStringOrNull(item.sourceIcon),
        sourceDomain,
        exactMatches,
        serpapiExactMatchesLink: toStringOrNull(item.serpapiExactMatchesLink),
        metadata,
        domain: sourceDomain,
        isAmazon: isAmazonDomain(sourceDomain),
        bucket: "visualMatches",
        originalImage: image,
        originalWidth: toNumberOrNull(item.imageWidth ?? item.originalWidth),
        originalHeight: toNumberOrNull(item.imageHeight ?? item.originalHeight),
      } satisfies LensSearchResultItem;
    })
    .filter((item) => Boolean(item.thumbnail || item.image));
};

const dedupeNormalizedItems = (items: LensSearchResultItem[]) => {
  const seen = new Set<string>();
  const out: LensSearchResultItem[] = [];
  for (const item of items) {
    const key = [
      String(item.link || ""),
      String(item.image || ""),
      String(item.thumbnail || ""),
      String(item.title || ""),
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
};

const withoutYouTubeItems = (items: LensSearchResultItem[]) =>
  items.filter((item) => !isYouTubeHost(item.link));

const sortItemsAmazonFirst = (items: LensSearchResultItem[]) =>
  [...items].sort((left, right) => {
    if (left.isAmazon !== right.isAmazon) {
      return left.isAmazon ? -1 : 1;
    }
    const leftRank = Number.isFinite(Number(left.rank)) ? Number(left.rank) : Number.MAX_SAFE_INTEGER;
    const rightRank = Number.isFinite(Number(right.rank))
      ? Number(right.rank)
      : Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) return leftRank - rightRank;
    const leftTitle = String(left.title || "").toLowerCase();
    const rightTitle = String(right.title || "").toLowerCase();
    return leftTitle.localeCompare(rightTitle);
  });

const collectAmazonLinks = (items: LensSearchResultItem[]) =>
  Array.from(
    new Set(
      items
        .filter((item) => item.isAmazon && Boolean(item.link))
        .map((item) => String(item.link || "").trim())
        .filter(Boolean)
    )
  );

const parseOptionsPayload = (input: unknown) => {
  if (!input) return null as Record<string, unknown> | null;
  if (typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  if (typeof input === "string") {
    const parsed = safeJsonParse(input);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  }
  return null;
};

const normalizeLocale = (value: unknown) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "sweden" || normalized === "se") return "sweden";
  if (
    normalized === "us_global" ||
    normalized === "us" ||
    normalized === "global_us" ||
    normalized === "usa" ||
    normalized === "global"
  ) {
    return "us_global";
  }
  return null;
};

const normalizeLensType = (value: unknown) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  return LENS_SEARCH_TYPES.has(normalized) ? normalized : null;
};

const pickServiceOptions = (payload: Record<string, unknown>) => {
  const options: Record<string, unknown> = {};

  const locale = normalizeLocale(
    payload.locale ?? payload.searchLocale ?? payload.marketLocale
  );
  options.locale = locale || "sweden";

  const type = normalizeLensType(payload.type ?? payload.searchType);
  if (type && type !== "visual_matches") {
    options.type = type;
  }

  ["q", "safe", "hl", "country"].forEach((key) => {
    const value = toStringOrNull(payload[key]);
    if (value) options[key] = value;
  });

  const noCache = parseBoolean(payload.noCache ?? payload.no_cache);
  if (noCache !== undefined) {
    options.noCache = noCache;
  }

  const asyncMode = parseBoolean(payload.asyncMode ?? payload.async);
  if (asyncMode !== undefined) {
    options.asyncMode = asyncMode;
  }

  const nestedOptions = parseOptionsPayload(payload.options);
  if (nestedOptions) {
    options.options = nestedOptions;
  }

  return options;
};

const parseServicePayload = async (response: Response) => {
  const rawText = await response.text();
  const parsed = safeJsonParse(rawText) as Record<string, unknown> | null;
  return {
    rawText,
    json: parsed ?? {},
  };
};

const SHARED_SERP_CONFIG_DIR = "/srv/SerpApi/config";
const SERPAPI_SEARCH_ENDPOINT = "https://serpapi.com/search.json";
const RESERVED_SERP_API_OPTION_KEYS = new Set([
  "engine",
  "url",
  "api_key",
  "imageUrl",
  "image_url",
  "locale",
  "location",
  "location_profile",
  "locationProfile",
  "locale_preset",
  "localePreset",
]);

const toRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const readJsonFileSafe = async (targetPath: string) => {
  try {
    const raw = await fs.readFile(targetPath, "utf8");
    const parsed = safeJsonParse(raw);
    return toRecord(parsed);
  } catch {
    return null;
  }
};

const resolveLensLocaleDefaults = async (locale: "sweden" | "us_global") => {
  const defaultsPath = path.join(SHARED_SERP_CONFIG_DIR, "defaults.json");
  const defaults = await readJsonFileSafe(defaultsPath);
  const googleLensDefaults = toRecord(defaults?.google_lens) || {};
  const localePresets = toRecord(googleLensDefaults.locale_presets) || {};
  const localePreset = toRecord(localePresets[locale]) || {};
  const country =
    toStringOrNull(localePreset.country) || toStringOrNull(googleLensDefaults.country);
  const hl = toStringOrNull(localePreset.hl) || toStringOrNull(googleLensDefaults.hl);
  return {
    country,
    hl,
  };
};

const pickSerpApiKey = async () => {
  const envKey = String(process.env.SERPAPI_API_KEY || "").trim();
  if (envKey) return envKey;

  const keyPoolPath = path.join(SHARED_SERP_CONFIG_DIR, "key-pool.json");
  const keyPool = await readJsonFileSafe(keyPoolPath);
  const keysRaw = Array.isArray(keyPool?.keys) ? keyPool.keys : [];
  const candidates = keysRaw
    .map((entry) => toRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => ({
      key: toStringOrNull(entry.api_key),
      enabled:
        typeof entry.enabled === "boolean"
          ? entry.enabled
          : parseBoolean(entry.enabled) ?? true,
      priority:
        Number.isFinite(Number(entry.priority)) ? Number(entry.priority) : Number.MAX_SAFE_INTEGER,
      remaining:
        Number.isFinite(Number(entry.remaining)) ? Number(entry.remaining) : Number.MAX_SAFE_INTEGER,
    }))
    .filter((entry) => Boolean(entry.key) && entry.enabled)
    .sort((left, right) => {
      if (left.priority !== right.priority) return left.priority - right.priority;
      return right.remaining - left.remaining;
    });

  const best = candidates[0];
  return best?.key || "";
};

const mapSerpApiVisualMatches = (value: unknown) => {
  if (!Array.isArray(value)) return [] as Record<string, unknown>[];
  return value
    .map((entry, index) => {
      const item = toRecord(entry) || {};
      const link = toStringOrNull(item.link);
      return {
        rank: toNumberOrNull(item.position) ?? index + 1,
        source: toStringOrNull(item.source),
        websiteName: toStringOrNull(item.source) || parseDomain(link),
        title: toStringOrNull(item.title),
        link,
        thumbnail: toStringOrNull(item.thumbnail),
        image: toStringOrNull(item.image),
        sourceIcon: toStringOrNull(item.source_icon),
        sourceDomain: parseDomain(link),
        exactMatches: Array.isArray(item.exact_matches)
          ? (item.exact_matches as unknown[])
          : null,
        serpapiExactMatchesLink: toStringOrNull(item.serpapi_exact_matches_link),
        metadata: item,
        imageWidth: toNumberOrNull(item.image_width),
        imageHeight: toNumberOrNull(item.image_height),
      } satisfies Record<string, unknown>;
    })
    .filter((item) => Boolean(item.thumbnail || item.image));
};

const mapSerpApiGenericList = (value: unknown) => {
  if (!Array.isArray(value)) return [] as Record<string, unknown>[];
  return value.map((entry, index) => {
    const item = toRecord(entry) || {};
    return {
      rank: toNumberOrNull(item.position) ?? index + 1,
      title: toStringOrNull(item.title),
      link: toStringOrNull(item.link),
      source: toStringOrNull(item.source),
      thumbnail: toStringOrNull(item.thumbnail),
      metadata: item,
    } satisfies Record<string, unknown>;
  });
};

const mapSerpApiRelatedContent = (value: unknown) => {
  if (!Array.isArray(value)) return [] as Record<string, unknown>[];
  return value.map((entry) => {
    const item = toRecord(entry) || {};
    const link = toStringOrNull(item.link);
    return {
      query: toStringOrNull(item.query),
      link,
      thumbnail: toStringOrNull(item.thumbnail),
      serpapiLink: toStringOrNull(item.serpapi_link),
      sourceDomain: parseDomain(link),
      metadata: item,
    } satisfies Record<string, unknown>;
  });
};

const buildDirectEngineOptions = (
  serviceOptions: Record<string, unknown>,
  localeDefaults: { country: string | null; hl: string | null }
) => {
  const options: Record<string, unknown> = {};
  const locale = normalizeLocale(serviceOptions.locale);
  if (locale) {
    options.locale = locale;
  }
  const type = normalizeLensType(serviceOptions.type);
  if (type) {
    options.type = type;
  }
  ["q", "safe", "hl", "country"].forEach((key) => {
    const value = toStringOrNull(serviceOptions[key]);
    if (value) options[key] = value;
  });
  if (!options.country && localeDefaults.country) {
    options.country = localeDefaults.country;
  }
  if (!options.hl && localeDefaults.hl) {
    options.hl = localeDefaults.hl;
  }

  const noCache =
    parseBoolean(serviceOptions.noCache) ??
    parseBoolean(serviceOptions.no_cache);
  if (noCache !== undefined) {
    options.no_cache = noCache;
  }

  const asyncMode =
    parseBoolean(serviceOptions.asyncMode) ??
    parseBoolean(serviceOptions.async);
  if (asyncMode !== undefined) {
    options.async = asyncMode;
  }

  const nestedOptions = parseOptionsPayload(serviceOptions.options);
  if (nestedOptions) {
    Object.entries(nestedOptions).forEach(([key, value]) => {
      if (value === undefined) return;
      if (RESERVED_SERP_API_OPTION_KEYS.has(key)) return;
      options[key] = value;
    });
  }

  if (!options.type) {
    options.type = "visual_matches";
  }
  if (!options.locale) {
    options.locale = "sweden";
  }
  return options;
};

const runSerpApiDirectLensSearch = async (input: {
  imageUrl: string;
  serviceOptions: Record<string, unknown>;
}) => {
  const { imageUrl, serviceOptions } = input;
  const locale = normalizeLocale(serviceOptions.locale) || "sweden";
  const localeDefaults = await resolveLensLocaleDefaults(locale);
  const apiKey = await pickSerpApiKey();
  if (!apiKey) {
    throw new Error("Missing SerpApi API key for Google Lens fallback.");
  }
  const directOptions = buildDirectEngineOptions(serviceOptions, localeDefaults);

  const params = new URLSearchParams({
    engine: "google_lens",
    url: imageUrl,
    api_key: apiKey,
  });
  Object.entries(directOptions).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    params.set(key, String(value));
  });

  const response = await fetch(`${SERPAPI_SEARCH_ENDPOINT}?${params.toString()}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });
  const rawText = await response.text();
  const rawJson = safeJsonParse(rawText);
  const raw = toRecord(rawJson);
  if (!raw) {
    throw new Error(
      `SerpApi fallback returned non-JSON response (HTTP ${response.status}).`
    );
  }
  const upstreamError = toStringOrNull(raw.error);
  if (!response.ok || upstreamError) {
    throw new Error(
      upstreamError || `SerpApi fallback failed (HTTP ${response.status}).`
    );
  }

  const rawSearchMetadata = toRecord(raw.search_metadata);
  const normalizedResponse = {
    searchMetadata: rawSearchMetadata,
    searchParameters: toRecord(raw.search_parameters),
    searchInformation: toRecord(raw.search_information),
    lensUrl: toStringOrNull(rawSearchMetadata?.google_lens_url),
    knowledgeGraph: toRecord(raw.knowledge_graph),
    visualMatches: mapSerpApiVisualMatches(raw.visual_matches),
    exactMatches: mapSerpApiGenericList(raw.exact_matches),
    products: mapSerpApiGenericList(raw.products),
    relatedContent: mapSerpApiRelatedContent(raw.related_content),
    aiOverview: raw.ai_overview ?? null,
    textResults: raw.text ?? raw.text_results ?? null,
    totalVisualMatches: Array.isArray(raw.visual_matches) ? raw.visual_matches.length : 0,
    totalExactMatches: Array.isArray(raw.exact_matches) ? raw.exact_matches.length : 0,
    totalProducts: Array.isArray(raw.products) ? raw.products.length : 0,
    totalRelatedContent: Array.isArray(raw.related_content) ? raw.related_content.length : 0,
  };

  const parsedJson: Record<string, unknown> = {
    id: toStringOrNull(rawSearchMetadata?.id) || crypto.randomUUID(),
    serpApiSearchId: toStringOrNull(rawSearchMetadata?.id),
    createdAt: new Date().toISOString(),
    imageUrl,
    normalizedResponse,
    rawResponse: raw,
  };
  return {
    parsedJson,
    requestPayload: {
      imageUrl,
      ...directOptions,
    },
  };
};

const requireAdmin = async () => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
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
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true as const };
};

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let payload: Record<string, unknown> = {};
  let uploadedImageFile: File | null = null;
  const contentType = String(request.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("multipart/form-data")) {
    try {
      const formData = await request.formData();
      const nextPayload: Record<string, unknown> = {};
      formData.forEach((value, key) => {
        if (key === "image") return;
        if (typeof value === "string") {
          nextPayload[key] = value;
        }
      });
      payload = nextPayload;
      const fileValue = formData.get("image");
      if (fileValue instanceof File && fileValue.size > 0) {
        uploadedImageFile = fileValue;
      }
    } catch {
      return NextResponse.json({ error: "Invalid multipart payload." }, { status: 400 });
    }
  } else {
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }
  }

  const imagePath = toStringOrNull(payload.imagePath);
  const targetImagePath = toStringOrNull(payload.targetImagePath) || imagePath;
  const imageUrl = normalizeExternalImageUrl(payload.imageUrl ?? payload.url);

  if (!imagePath && !imageUrl && !uploadedImageFile) {
    return NextResponse.json(
      { error: "Provide imagePath, imageUrl/url, or uploaded image file." },
      { status: 400 }
    );
  }

  const serviceOptions = pickServiceOptions(payload);
  const requestedLimit = clampResultLimit(
    payload.limit ?? payload.maxResults ?? payload.resultLimit
  );
  const serviceBaseUrls = toServiceUrls();

  try {
    const externallyReachableImageUrl =
      imageUrl || (imagePath ? await ensurePublicTempImageUrl(request, imagePath) : "");
    if (!externallyReachableImageUrl && !uploadedImageFile) {
      return NextResponse.json(
        { error: "Unable to expose image URL for Google Lens search." },
        { status: 400 }
      );
    }

    const performServiceRequest = async (serviceBaseUrl: string) => {
      const searchUrl = `${serviceBaseUrl}${SEARCH_ENDPOINT}`;
      const historyUrl = `${serviceBaseUrl}${HISTORY_ENDPOINT}`;
      const historyRawTemplateUrl = `${serviceBaseUrl}${HISTORY_RAW_TEMPLATE}`;
      let servicePayload: Record<string, unknown> = {
        imageUrl: externallyReachableImageUrl || undefined,
        ...serviceOptions,
      };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        let serviceResponse: Response;
        if (uploadedImageFile) {
          const form = new FormData();
          form.set("image", uploadedImageFile, uploadedImageFile.name || "image");
          if (externallyReachableImageUrl) {
            form.set("imageUrl", externallyReachableImageUrl);
          }
          Object.entries(serviceOptions).forEach(([key, value]) => {
            if (value === undefined || value === null) return;
            if (key === "options" && typeof value === "object") {
              form.set("options", JSON.stringify(value));
              return;
            }
            form.set(key, String(value));
          });
          servicePayload = {
            ...serviceOptions,
            imageUrl: externallyReachableImageUrl || null,
            uploadedImageFileName: uploadedImageFile.name || null,
            uploadedImageFileBytes: uploadedImageFile.size,
          };
          serviceResponse = await fetch(searchUrl, {
            method: "POST",
            body: form,
            signal: controller.signal,
          });
        } else {
          serviceResponse = await fetch(searchUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(servicePayload),
            signal: controller.signal,
          });
        }
        const parsed = await parseServicePayload(serviceResponse);
        return {
          serviceBaseUrl,
          searchUrl,
          historyUrl,
          historyRawTemplateUrl,
          servicePayload,
          serviceResponse,
          parsed,
        };
      } finally {
        clearTimeout(timeout);
      }
    };

    const serviceAttemptErrors: string[] = [];
    const tryServiceCandidates = async () => {
      for (const serviceBaseUrl of serviceBaseUrls) {
        try {
          const result = await performServiceRequest(serviceBaseUrl);
          if (result.serviceResponse.status === 404) {
            serviceAttemptErrors.push(
              `${result.searchUrl}: endpoint not found (HTTP 404)`
            );
            continue;
          }
          return result;
        } catch (error) {
          const message =
            error instanceof Error && error.name === "AbortError"
              ? "request timed out"
              : error instanceof Error
                ? error.message
                : "request failed";
          serviceAttemptErrors.push(`${serviceBaseUrl}${SEARCH_ENDPOINT}: ${message}`);
        }
      }
      return null;
    };

    let serviceResult = await tryServiceCandidates();
    if (!serviceResult) {
      await maybeBootLocalLensService(serviceBaseUrls);
      serviceResult = await tryServiceCandidates();
    }

    let parsedJson: Record<string, unknown> = {};
    let servicePayloadForDebug: Record<string, unknown> = {};
    let searchUrl = "";
    let historyUrl = "";
    let historyRawTemplateUrl = "";
    let responseStatus: number | null = null;
    let usedDirectEngineFallback = false;
    let directFallbackError: string | null = null;

    if (serviceResult) {
      const {
        servicePayload,
        serviceResponse,
        parsed,
        searchUrl: selectedSearchUrl,
        historyUrl: selectedHistoryUrl,
        historyRawTemplateUrl: selectedHistoryRawTemplateUrl,
      } = serviceResult;
      servicePayloadForDebug = servicePayload;
      parsedJson = parsed.json;
      searchUrl = selectedSearchUrl;
      historyUrl = selectedHistoryUrl;
      historyRawTemplateUrl = selectedHistoryRawTemplateUrl;
      responseStatus = serviceResponse.status;

      if (!serviceResponse.ok) {
        const defaultError =
          serviceResponse.status === 404
            ? `Google Lens service endpoint not found at ${selectedSearchUrl}.`
            : `Google Lens lookup failed (HTTP ${serviceResponse.status}).`;
        return NextResponse.json(
          {
            error: toStringOrNull(parsed.json.error) || defaultError,
            details: parsed.json,
            debug: {
              mode: "google_lens",
              transport: "http_service",
              input: {
                targetImagePath: targetImagePath ?? null,
                sourceImagePath: imagePath ?? null,
                sourceImageUrl: externallyReachableImageUrl || null,
                serviceOptions,
                requestedLimit,
              },
              requestPayload: servicePayload,
              responseStatus: serviceResponse.status,
              serviceUrl: selectedSearchUrl,
              historyUrl: selectedHistoryUrl,
              historyRawUrlTemplate: selectedHistoryRawTemplateUrl,
            },
          },
          { status: serviceResponse.status }
        );
      }
    } else {
      if (!externallyReachableImageUrl) {
        return NextResponse.json(
          {
            error:
              "Google Lens service is unavailable and direct fallback requires a public image URL.",
            details: serviceAttemptErrors.slice(0, 8),
            debug: {
              serviceUrlsChecked: serviceBaseUrls,
              endpoint: SEARCH_ENDPOINT,
            },
          },
          { status: 502 }
        );
      }

      try {
        const directFallbackResult = await runSerpApiDirectLensSearch({
          imageUrl: externallyReachableImageUrl,
          serviceOptions,
        });
        parsedJson = directFallbackResult.parsedJson;
        servicePayloadForDebug = directFallbackResult.requestPayload;
        searchUrl = "direct://google-lens-engine";
        historyUrl = "";
        historyRawTemplateUrl = "";
        responseStatus = 200;
        usedDirectEngineFallback = true;
      } catch (error) {
        directFallbackError =
          error instanceof Error ? error.message : "Direct Lens fallback failed.";
      }

      if (!usedDirectEngineFallback) {
        return NextResponse.json(
          {
            error:
              "Google Lens service is unavailable. The local Lens service is not reachable.",
            details: serviceAttemptErrors.slice(0, 8),
            debug: {
              serviceUrlsChecked: serviceBaseUrls,
              endpoint: SEARCH_ENDPOINT,
              fallback: directFallbackError,
            },
          },
          { status: 502 }
        );
      }
    }

    const normalizedResponse =
      parsedJson &&
      typeof parsedJson === "object" &&
      parsedJson.normalizedResponse &&
      typeof parsedJson.normalizedResponse === "object"
        ? (parsedJson.normalizedResponse as Record<string, unknown>)
        : {};

    const visualMatches = normalizeVisualMatches(normalizedResponse.visualMatches);
    const items = sortItemsAmazonFirst(
      withoutYouTubeItems(dedupeNormalizedItems(visualMatches))
    ).slice(0, requestedLimit);
    const amazonLinks = collectAmazonLinks(items);

    const debugPayload = {
      mode: "google_lens",
      transport: usedDirectEngineFallback ? "direct_engine" : "http_service",
      input: {
        targetImagePath: targetImagePath ?? null,
        sourceImagePath: imagePath ?? null,
        sourceImageUrl: externallyReachableImageUrl || null,
        serviceOptions,
        requestedLimit,
      },
      requestPayload: servicePayloadForDebug,
      output: {
        totalVisualMatches: visualMatches.length,
        itemsReturned: items.length,
        amazonLinksReturned: amazonLinks.length,
      },
      serviceUrl: searchUrl,
      historyUrl,
      historyRawUrlTemplate: historyRawTemplateUrl,
    } as Record<string, unknown>;

    let persisted:
      | { imagePath: string; imageHash: string; updatedAt: string }
      | null = null;
    if (targetImagePath) {
      try {
        const stored = await saveStoredLensSearchRecordForImagePath({
          imagePath: targetImagePath,
          sourceImagePath: imagePath,
          sourceImageUrl:
            toStringOrNull(parsedJson.imageUrl) || externallyReachableImageUrl || null,
          searchId: toStringOrNull(parsedJson.id),
          serpApiSearchId: toStringOrNull(parsedJson.serpApiSearchId),
          providerCreatedAt: toStringOrNull(parsedJson.createdAt),
          requestedLimit,
          serviceOptions,
          inputPayload: {
            targetImagePath: targetImagePath ?? null,
            imagePath: imagePath ?? null,
            imageUrl:
              toStringOrNull(parsedJson.imageUrl) || externallyReachableImageUrl || null,
            serviceOptions,
            requestedLimit,
          },
          debugPayload,
          items,
          amazonLinks,
          error: null,
        });
        if (stored?.record) {
          persisted = {
            imagePath: stored.imagePath,
            imageHash: stored.imageHash,
            updatedAt: stored.record.updatedAt,
          };
        }
      } catch {
        // Keep API success response even if persistence fails.
      }
    }

    const relatedContent = Array.isArray(normalizedResponse.relatedContent)
      ? normalizedResponse.relatedContent
      : [];
    const exactMatches = Array.isArray(normalizedResponse.exactMatches)
      ? normalizedResponse.exactMatches
      : [];

    return NextResponse.json({
      ok: true,
      id: toStringOrNull(parsedJson.id),
      serpApiSearchId: toStringOrNull(parsedJson.serpApiSearchId),
      createdAt: toStringOrNull(parsedJson.createdAt),
      targetImagePath: targetImagePath ?? null,
      imagePath: imagePath ?? null,
      imageUrl:
        toStringOrNull(parsedJson.imageUrl) || externallyReachableImageUrl || null,
      total: items.length,
      amazonCount: amazonLinks.length,
      items,
      amazonLinks,
      relatedContent,
      exactMatches,
      persisted,
      debug: debugPayload,
      responseStatus,
    });
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Google Lens search timed out."
        : error instanceof Error
          ? error.message
          : "Google Lens search failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
