import fs from "fs";
import path from "path";
import sharp from "sharp";

const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".bmp",
  ".avif",
  ".tif",
  ".tiff",
]);

export const looksLikeImageFileName = (name: string) => {
  const ext = path.extname(String(name || "")).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
};

export const convertBufferToJpeg = async (input: Buffer) => {
  // Always flatten to avoid alpha artifacts when converting PNG/WebP/etc to JPEG.
  return sharp(input, { failOnError: false })
    .rotate()
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
};

export const convertImageFileToJpegInPlace = async (absolutePath: string) => {
  const input = fs.readFileSync(absolutePath);
  const output = await convertBufferToJpeg(input);
  fs.writeFileSync(absolutePath, output);
};

