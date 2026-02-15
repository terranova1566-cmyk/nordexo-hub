type FxCacheEntry = {
  rate: number;
  fetchedAtMs: number;
};

type FxRateResponse = {
  rates?: Record<string, number>;
};

const FRANKFURTER_ENDPOINT = "https://api.frankfurter.dev/v1/latest";
const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000; // 12h

const fxCache = new Map<string, FxCacheEntry>();

const normalizeCurrency = (value: string) => String(value || "").trim().toUpperCase();

const parseEnvRate = (key: string): number | null => {
  const raw = process.env[key];
  if (!raw) return null;
  const parsed = Number(String(raw).trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const envKeyForPair = (from: string, to: string) => `FX_${from}_${to}`;

async function fetchFxRateFrankfurter(from: string, to: string): Promise<number | null> {
  const url = `${FRANKFURTER_ENDPOINT}?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "NordexoHubFx/1.0",
    },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as FxRateResponse;
  const rate = json?.rates?.[to];
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? rate : null;
}

export async function getFxRate(fromRaw: string, toRaw: string) {
  const from = normalizeCurrency(fromRaw);
  const to = normalizeCurrency(toRaw);
  if (!from || !to) return null;
  if (from === to) return 1;

  const key = `${from}->${to}`;
  const cached = fxCache.get(key);
  if (cached && Date.now() - cached.fetchedAtMs < DEFAULT_TTL_MS) {
    return cached.rate;
  }
  const staleRate = cached?.rate ?? null;

  // Prefer explicit env overrides. Useful for fully offline environments.
  const envKey = envKeyForPair(from, to);
  const envRate = parseEnvRate(envKey);
  if (envRate) {
    fxCache.set(key, { rate: envRate, fetchedAtMs: Date.now() });
    return envRate;
  }

  try {
    const fetched = await fetchFxRateFrankfurter(from, to);
    if (!fetched) return staleRate;
    fxCache.set(key, { rate: fetched, fetchedAtMs: Date.now() });
    return fetched;
  } catch {
    return staleRate;
  }
}

export async function convertAmount(amount: number, from: string, to: string) {
  const rate = await getFxRate(from, to);
  if (!rate) return null;
  const converted = amount * rate;
  return Number.isFinite(converted) ? converted : null;
}

export type MoneyLike = {
  amount: number | null;
  currency: string | null;
};

export async function convertMoneyToSekNoDecimals(money: MoneyLike): Promise<MoneyLike> {
  const amount = typeof money.amount === "number" && Number.isFinite(money.amount) ? money.amount : null;
  if (amount === null) return { amount: null, currency: "SEK" };

  const from = normalizeCurrency(money.currency || "");
  if (!from) return { amount: Math.round(amount), currency: "SEK" };
  if (from === "SEK") return { amount: Math.round(amount), currency: "SEK" };

  const converted = await convertAmount(amount, from, "SEK");
  if (converted === null) {
    // If conversion fails, keep original rather than lying about the currency.
    return { amount, currency: from };
  }

  return { amount: Math.round(converted), currency: "SEK" };
}
