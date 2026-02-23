#!/usr/bin/env node

import fs from "fs";
import path from "path";
import sharp from "sharp";

const SUPPORTED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const usage = () => {
  console.log(
    [
      "Usage:",
      "  node scripts/fix-mono-contrast.mjs --file <path> [--lower 0.8] [--upper 99.2] [--quality 92]",
      "  node scripts/fix-mono-contrast.mjs --dir <path> [--recursive] [--lower 0.8] [--upper 99.2] [--quality 92]",
      "",
      "Notes:",
      "  - lower/upper are percentile cut points for histogram tails (0-100).",
      "  - Uses sharp.normalise(), which stretches luminance contrast.",
      "  - Writes in place (safe temp file + rename fallback).",
    ].join("\n")
  );
};

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizePercent = (value, fallback) => {
  const num = toNumber(value, fallback);
  if (num < 0) return 0;
  if (num > 100) return 100;
  return num;
};

const normalizeQuality = (value, fallback) => {
  const num = Math.round(toNumber(value, fallback));
  if (num < 1) return 1;
  if (num > 100) return 100;
  return num;
};

const parseArgs = (argv) => {
  const options = {
    file: "",
    dir: "",
    recursive: false,
    lower: 0.8,
    upper: 99.2,
    quality: 92,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || "").trim();
    if (!arg) continue;
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg === "--file") {
      options.file = String(argv[i + 1] || "").trim();
      i += 1;
      continue;
    }
    if (arg === "--dir") {
      options.dir = String(argv[i + 1] || "").trim();
      i += 1;
      continue;
    }
    if (arg === "--recursive") {
      options.recursive = true;
      continue;
    }
    if (arg === "--lower") {
      options.lower = normalizePercent(argv[i + 1], options.lower);
      i += 1;
      continue;
    }
    if (arg === "--upper") {
      options.upper = normalizePercent(argv[i + 1], options.upper);
      i += 1;
      continue;
    }
    if (arg === "--quality") {
      options.quality = normalizeQuality(argv[i + 1], options.quality);
      i += 1;
      continue;
    }
    console.error(`Unknown argument: ${arg}`);
    usage();
    process.exit(1);
  }

  if (!options.file && !options.dir) {
    console.error("Missing input: use --file or --dir.");
    usage();
    process.exit(1);
  }
  if (options.file && options.dir) {
    console.error("Use either --file or --dir, not both.");
    usage();
    process.exit(1);
  }
  if (options.upper <= options.lower) {
    console.error("--upper must be greater than --lower.");
    process.exit(1);
  }

  return options;
};

const isSupportedImagePath = (filePath) =>
  SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase());

const collectFiles = (rootDir, recursive) => {
  const queue = [rootDir];
  const results = [];

  while (queue.length > 0) {
    const current = queue.shift();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (recursive) queue.push(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      if (isSupportedImagePath(absolute)) results.push(absolute);
    }
  }

  return results;
};

const moveFileWithFallback = (source, target) => {
  try {
    fs.renameSync(source, target);
    return true;
  } catch {}
  try {
    if (fs.existsSync(target)) fs.unlinkSync(target);
    fs.copyFileSync(source, target);
    fs.unlinkSync(source);
    return true;
  } catch {
    return false;
  }
};

const encodeForExtension = (pipeline, ext, quality) => {
  if (ext === ".png") {
    return pipeline.png({ compressionLevel: 9, adaptiveFiltering: true });
  }
  if (ext === ".webp") {
    return pipeline.webp({ quality });
  }
  return pipeline.jpeg({ quality, mozjpeg: true });
};

const applyMonoContrastInPlace = async (filePath, options) => {
  const ext = path.extname(filePath).toLowerCase();
  const parsed = path.parse(filePath);
  const tempPath = path.join(
    parsed.dir,
    `.${parsed.name}.mono-contrast-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2, 10)}.tmp${ext || ".jpg"}`
  );

  try {
    const pipeline = sharp(filePath, { failOnError: false })
      .rotate()
      .normalise({
        lower: options.lower,
        upper: options.upper,
      });

    await encodeForExtension(pipeline, ext, options.quality).toFile(tempPath);
    if (!moveFileWithFallback(tempPath, filePath)) {
      throw new Error("Unable to persist processed image.");
    }
  } finally {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {}
  }
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));

  let files = [];
  if (options.file) {
    const absolute = path.resolve(options.file);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      throw new Error(`File not found: ${absolute}`);
    }
    if (!isSupportedImagePath(absolute)) {
      throw new Error(`Unsupported file extension: ${absolute}`);
    }
    files = [absolute];
  } else {
    const absoluteDir = path.resolve(options.dir);
    if (!fs.existsSync(absoluteDir) || !fs.statSync(absoluteDir).isDirectory()) {
      throw new Error(`Directory not found: ${absoluteDir}`);
    }
    files = collectFiles(absoluteDir, options.recursive);
  }

  if (files.length === 0) {
    console.log("No images found.");
    return;
  }

  const startedAt = Date.now();
  let success = 0;
  let failed = 0;

  for (const file of files) {
    try {
      await applyMonoContrastInPlace(file, options);
      success += 1;
      console.log(`ok  ${file}`);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`err ${file} -> ${message}`);
    }
  }

  const elapsedMs = Date.now() - startedAt;
  console.log(
    `done total=${files.length} ok=${success} failed=${failed} lower=${options.lower} upper=${options.upper} elapsed_ms=${elapsedMs}`
  );
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
