#!/usr/bin/env node
import fs from "fs";
import path from "path";
import sharp from "sharp";

const OUTPUT_WIDTH = 1424;
const OUTPUT_HEIGHT = 752;
const DEFAULT_FADE_PERCENT = 35;
const LEFT_IMAGE_SCALE = 0.925;
const RIGHT_OVERFLOW_PX = 30;

const parseArgs = (argv) => {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token || !token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    if (value && !value.startsWith("--")) {
      out[key] = value;
      i += 1;
    } else {
      out[key] = "true";
    }
  }
  return out;
};

const usage = () => {
  process.stdout.write(
    [
      "Usage:",
      "  node scripts/merge-digideal-main.mjs --a <imageA> --b <imageB> --out <output.jpg> [--fade 35]",
      "",
      "Behavior:",
      "  - Auto picks left image as the one with stronger white borders.",
      "  - Applies white fade on left 35% of right image (default).",
      "  - Writes merged output as 1424x752 JPEG.",
      "",
    ].join("\n")
  );
};

const clampFadePercent = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_FADE_PERCENT;
  if (n < 1) return 1;
  if (n > 50) return 50;
  return Math.round(n);
};

const borderWhiteRatio = async (image, extract) => {
  const raw = await image
    .clone()
    .extract(extract)
    .raw()
    .toBuffer();
  const channels = 4;
  const pixelCount = Math.floor(raw.length / channels);
  if (!pixelCount) return 0;
  let whiteCount = 0;
  for (let i = 0; i < raw.length; i += channels) {
    const r = raw[i];
    const g = raw[i + 1];
    const b = raw[i + 2];
    const a = raw[i + 3];
    const isWhite = a < 16 || (r >= 245 && g >= 245 && b >= 245);
    if (isWhite) whiteCount += 1;
  }
  return whiteCount / pixelCount;
};

const measureWhiteBorderScore = async (absolutePath) => {
  const image = sharp(absolutePath).rotate().ensureAlpha();
  const meta = await image.metadata();
  const width = Number(meta.width || 0);
  const height = Number(meta.height || 0);
  if (!width || !height) return { whiteSides: 0, borderDensity: 0, score: 0 };

  const stripe = Math.max(1, Math.floor(Math.min(width, height) * 0.02));
  const top = await borderWhiteRatio(image, { left: 0, top: 0, width, height: stripe });
  const bottom = await borderWhiteRatio(image, {
    left: 0,
    top: Math.max(0, height - stripe),
    width,
    height: stripe,
  });
  const left = await borderWhiteRatio(image, { left: 0, top: 0, width: stripe, height });
  const right = await borderWhiteRatio(image, {
    left: Math.max(0, width - stripe),
    top: 0,
    width: stripe,
    height,
  });

  const ratios = [top, bottom, left, right];
  const whiteSides = ratios.filter((ratio) => ratio >= 0.93).length;
  const borderDensity = ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
  const score = whiteSides * 10 + borderDensity;
  return { whiteSides, borderDensity, score };
};

const buildRightFadeOverlay = (size, fadePercent) => {
  const fadeWidth = Math.max(1, Math.round(size * (fadePercent / 100)));
  const raw = Buffer.alloc(size * size * 4, 0);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const idx = (y * size + x) * 4;
      raw[idx] = 255;
      raw[idx + 1] = 255;
      raw[idx + 2] = 255;
      if (x >= fadeWidth) {
        raw[idx + 3] = 0;
        continue;
      }
      const ratio = fadeWidth <= 1 ? 1 : 1 - x / (fadeWidth - 1);
      raw[idx + 3] = Math.max(0, Math.min(255, Math.round(ratio * 255)));
    }
  }
  return { raw, fadeWidth };
};

const mergeDigidealMain = async ({ imageA, imageB, outPath, fadePercent }) => {
  const a = path.resolve(String(imageA || ""));
  const b = path.resolve(String(imageB || ""));
  const out = path.resolve(String(outPath || ""));
  if (!a || !b || !out) throw new Error("Missing required paths.");
  if (!fs.existsSync(a) || !fs.statSync(a).isFile()) throw new Error(`Missing image: ${a}`);
  if (!fs.existsSync(b) || !fs.statSync(b).isFile()) throw new Error(`Missing image: ${b}`);

  const scoreA = await measureWhiteBorderScore(a);
  const scoreB = await measureWhiteBorderScore(b);
  const [leftPath, rightPath] = scoreB.score > scoreA.score ? [b, a] : [a, b];

  const tile = OUTPUT_HEIGHT;
  const leftTileSize = Math.max(1, Math.round(tile * LEFT_IMAGE_SCALE));
  const leftTop = Math.max(0, Math.floor((OUTPUT_HEIGHT - leftTileSize) / 2));
  const leftTile = await sharp(leftPath)
    .rotate()
    .resize(leftTileSize, leftTileSize, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();
  const rightTile = await sharp(rightPath)
    .rotate()
    .resize(tile, tile, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();

  const { raw: fadeOverlayRaw, fadeWidth } = buildRightFadeOverlay(tile, fadePercent);
  const rightFaded = await sharp(rightTile)
    .composite([
      {
        input: fadeOverlayRaw,
        raw: { width: tile, height: tile, channels: 4 },
        blend: "over",
      },
    ])
    .png()
    .toBuffer();

  const rightLeft = Math.max(0, OUTPUT_WIDTH - tile + RIGHT_OVERFLOW_PX);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await sharp({
    create: {
      width: OUTPUT_WIDTH,
      height: OUTPUT_HEIGHT,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([
      { input: leftTile, left: 0, top: leftTop },
      { input: rightFaded, left: rightLeft, top: 0 },
    ])
    .jpeg({ quality: 92, mozjpeg: true, chromaSubsampling: "4:4:4" })
    .toFile(out);

  return {
    output: out,
    width: OUTPUT_WIDTH,
    height: OUTPUT_HEIGHT,
    fadePercent,
    fadePixels: fadeWidth,
    leftImage: leftPath,
    rightImage: rightPath,
    leftScale: LEFT_IMAGE_SCALE,
    leftTilePixels: leftTileSize,
    leftOffsetY: leftTop,
    rightOverflowPixels: RIGHT_OVERFLOW_PX,
  };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h || !args.a || !args.b || !args.out) {
    usage();
    process.exit(args.help || args.h ? 0 : 1);
  }
  const fadePercent = clampFadePercent(args.fade);
  const result = await mergeDigidealMain({
    imageA: args.a,
    imageB: args.b,
    outPath: args.out,
    fadePercent,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
};

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
