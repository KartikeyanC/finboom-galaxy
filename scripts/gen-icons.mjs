// One-off PWA icon generator (run with sharp installed via --no-save):
//   npm install --no-save sharp && node scripts/gen-icons.mjs
// Renders the FinRoot mark to PNGs at the sizes a PWA needs. The mark is
// auto-measured and re-centered so it fills the tile (bold for the standard
// "any" icons, kept inside the safe zone for the maskable icon).
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pub = path.join(root, "public");
const iconsDir = path.join(pub, "icons");

const MARK = `
  <g transform="translate(216.1 170) scale(0.8303)">
    <ellipse cx="341.88" cy="397.46" rx="444.28" ry="278.19" fill="#0D7A5F" transform="translate(-179.8 449.48) rotate(-54.99)"/>
    <g fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round" stroke-width="28">
      <path d="M89.09,702.36c-3.73-60.24-2.36-177.44,59-304,21.44-44.23,67.97-137.29,173-212,99.69-70.92,200.79-88.8,256.32-93.73,9.75-.87,18.18,6.71,18.38,16.49.99,50.12-5.28,144.94-61.69,244.24-60.63,106.71-146.1,160.38-183.5,181"/>
      <path d="M146.09,702.36c-3.66-50.4-3.99-152.67,49-264,18.84-39.59,68.25-139.93,182-209,50.27-30.52,97.93-45.72,132.57-53.72,5.14-1.19,9.91,3.11,9.26,8.34-4.89,39.54-19.48,107.74-67.83,175.37-63.91,89.4-150.63,127.22-198.53,142.56-11.18,3.58-14.58,17.75-6.25,26.02,17.38,17.27,37.1,40.48,54.79,70.42,23.87,40.39,35.13,77.97,40.79,104"/>
    </g>
  </g>`;

const probe = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">${MARK}</svg>`;
const { data, info } = await sharp(Buffer.from(probe), { density: 384 })
  .resize(1000, 1000).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const ch = info.channels;
let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
for (let y = 0; y < info.height; y++) {
  for (let x = 0; x < info.width; x++) {
    const a = data[(y * info.width + x) * ch + (ch - 1)];
    if (a > 30) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
}
const Cx = (minX + maxX) / 2, Cy = (minY + maxY) / 2, W = maxX - minX, H = maxY - minY;

const place = (target) =>
  `<g transform="translate(500 500) scale(${(target / Math.max(W, H)).toFixed(4)}) translate(${(-Cx).toFixed(1)} ${(-Cy).toFixed(1)})">${MARK}</g>`;
const roundedBg = `<rect width="1000" height="1000" rx="220" fill="#0D7A5F"/>`;
const squareBg = `<rect width="1000" height="1000" fill="#0D7A5F"/>`;
const svg = (bg, mark) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">${bg}${mark}</svg>`;
const anyMark = place(840), maskMark = place(640);
const png = (s, size, out) => sharp(Buffer.from(s), { density: 384 }).resize(size, size).png().toFile(out);

await mkdir(iconsDir, { recursive: true });
await Promise.all([
  png(svg(roundedBg, anyMark), 192, path.join(iconsDir, "icon-192.png")),
  png(svg(roundedBg, anyMark), 512, path.join(iconsDir, "icon-512.png")),
  png(svg(squareBg, maskMark), 512, path.join(iconsDir, "maskable-512.png")),
  png(svg(squareBg, anyMark), 180, path.join(pub, "apple-touch-icon.png")),
  png(svg(roundedBg, anyMark), 32, path.join(pub, "favicon-32.png")),
]);
await writeFile(path.join(pub, "favicon.svg"), svg(roundedBg, anyMark) + "\n");
console.log("icons generated");
