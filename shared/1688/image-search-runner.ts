import * as runner from "./image-search-runner.mjs";

export type Run1688ImageSearchInput = {
  toolPath?: string;
  publicBaseUrl?: string | null;
  imagePath?: string | null;
  imageUrl?: string | null;
  limit?: number;
  page?: number;
  cpsFirst?: boolean;
  includeRaw?: boolean;
  pretty?: boolean;
  sortFields?: string;
  fields?: string | null;
  timeoutMs?: number;
  maxBuffer?: number;
  env?: Record<string, string>;
};

export type Run1688ImageSearchResult =
  | { ok: true; payload: unknown }
  | { ok: false; error: string; status?: number; payload?: unknown; stdout?: string };

export const DEFAULT_1688_IMAGE_SEARCH_TOOL_PATH: string =
  runner.DEFAULT_1688_IMAGE_SEARCH_TOOL_PATH;

export const getPublicBaseUrlFromRequest: (request: Request) => string | null =
  runner.getPublicBaseUrlFromRequest;

export const run1688ImageSearch = (
  input: Run1688ImageSearchInput
): Run1688ImageSearchResult =>
  runner.run1688ImageSearch(
    input as Parameters<typeof runner.run1688ImageSearch>[0]
  ) as Run1688ImageSearchResult;
