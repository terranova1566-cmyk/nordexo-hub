import * as core from "./core.mjs";

export type CanonicalOfferInput = {
  offerId?: string | number | null;
  detailUrl?: string | null;
  [key: string]: unknown;
};

export const asText: (value: unknown) => string = core.asText;

export const toOfferId: (offer: CanonicalOfferInput | null | undefined) => string | null =
  core.toOfferId;

export const canonical1688OfferUrlText: (value: unknown) => string =
  core.canonical1688OfferUrlText;

export const canonical1688OfferUrl: (
  offer: CanonicalOfferInput | null | undefined
) => string | null = core.canonical1688OfferUrl;

export const extractJsonFromText: (text: unknown) => unknown = core.extractJsonFromText;

export const isImageFetchError: (error: unknown) => boolean = core.isImageFetchError;

export const hasCjk: (value: unknown) => boolean = core.hasCjk;

export const toWeightGrams: (
  value: unknown,
  options?: { allowUnitless?: boolean }
) => number | null = core.toWeightGrams;

export const normalizeNameStrict: (value: unknown) => string = core.normalizeNameStrict;

export const normalizeNameLoose: (value: unknown) => string = core.normalizeNameLoose;

export const parseVariantWeightTableFromReadableText: (
  value: unknown,
  options?: { maxScanLines?: number }
) => { weightByName: Map<string, number>; weights: number[] } =
  core.parseVariantWeightTableFromReadableText;

export const pickFallbackWeightGrams: (
  candidates: unknown[],
  options?: {
    allowUnitless?: boolean;
    minPlausible?: number;
    maxPlausible?: number;
  }
) => number | null = core.pickFallbackWeightGrams;
