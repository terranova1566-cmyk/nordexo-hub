import { spawnSync } from "node:child_process";
import { asText, extractJsonFromText } from "./core.mjs";

export const DEFAULT_1688_IMAGE_SEARCH_TOOL_PATH =
  "/srv/node-tools/1688-image-search/index.js";

export const getPublicBaseUrlFromRequest = (request) => {
  const proto = request?.headers?.get("x-forwarded-proto") || "https";
  const host =
    request?.headers?.get("x-forwarded-host") || request?.headers?.get("host");
  if (!host) return null;
  return `${proto}://${host}`;
};

const toOptionalText = (value) => {
  const text = asText(value);
  return text || null;
};

const buildArgs = (input) => {
  const args = [
    "--pretty",
    input.pretty ? "true" : "false",
    "--limit",
    String(input.limit),
    "--page",
    String(input.page),
    "--cpsFirst",
    input.cpsFirst ? "true" : "false",
    "--includeRaw",
    input.includeRaw ? "true" : "false",
  ];

  if (input.sortFields) args.push("--sortFields", input.sortFields);
  if (input.fields) args.push("--fields", input.fields);
  if (input.imagePath) args.push("--image", input.imagePath);
  if (input.imageUrl) args.push("--image-url", input.imageUrl);
  return args;
};

export const run1688ImageSearch = ({
  toolPath = DEFAULT_1688_IMAGE_SEARCH_TOOL_PATH,
  publicBaseUrl,
  imagePath = null,
  imageUrl = null,
  limit = 10,
  page = 1,
  cpsFirst = false,
  includeRaw = false,
  pretty = false,
  sortFields = "",
  fields = null,
  timeoutMs = 60_000,
  maxBuffer = 20 * 1024 * 1024,
  env = {},
} = {}) => {
  const normalizedImagePath = toOptionalText(imagePath);
  const normalizedImageUrl = toOptionalText(imageUrl);
  if (!normalizedImagePath && !normalizedImageUrl) {
    return { ok: false, error: "Missing imagePath or imageUrl.", status: 400 };
  }
  if (!publicBaseUrl) {
    return { ok: false, error: "Unable to determine public base URL.", status: 500 };
  }

  const args = buildArgs({
    pretty: Boolean(pretty),
    limit: Number.isFinite(Number(limit)) ? Math.trunc(Number(limit)) : 10,
    page: Number.isFinite(Number(page)) ? Math.trunc(Number(page)) : 1,
    cpsFirst: Boolean(cpsFirst),
    includeRaw: Boolean(includeRaw),
    sortFields: asText(sortFields),
    fields: toOptionalText(fields),
    imagePath: normalizedImagePath,
    imageUrl: normalizedImageUrl,
  });

  const result = spawnSync(process.execPath, [toolPath, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      PUBLIC_BASE_URL: publicBaseUrl,
      // Keep temp URLs available longer than the tool default so later recrop flows still work.
      PUBLIC_TEMP_IMAGE_TTL_MS:
        process.env.PUBLIC_TEMP_IMAGE_TTL_MS || String(30 * 60 * 1000),
      ...env,
    },
    maxBuffer,
    timeout: timeoutMs,
  });

  const stdout = asText(result.stdout);
  const stderr = asText(result.stderr);
  const parsed = extractJsonFromText(stdout);

  if (parsed && typeof parsed === "object") {
    if (parsed.ok === false) {
      const message =
        asText(parsed?.error?.message) || asText(parsed?.error) || stderr || "1688 image search failed.";
      return { ok: false, error: message, status: 502, payload: parsed };
    }
    return { ok: true, payload: parsed };
  }

  const status = result.status === 2 ? 400 : 500;
  return {
    ok: false,
    error: stderr || "1688 image search failed.",
    status,
    stdout,
  };
};
