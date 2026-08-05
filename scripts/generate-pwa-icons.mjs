import sharp from "sharp";
import { mkdirSync } from "node:fs";

const SRC = "public/apple-touch-icon.png";
const BG = "#f8fafc";

mkdirSync("public", { recursive: true });

async function square(size, outfile) {
  await sharp(SRC)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outfile);
}

async function maskable(size, outfile) {
  const iconSize = Math.round(size * 0.6);
  const icon = await sharp(SRC).resize(iconSize, iconSize).png().toBuffer();
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BG,
    },
  })
    .composite([{ input: icon, gravity: "center" }])
    .png()
    .toFile(outfile);
}

await square(192, "public/pwa-192x192.png");
await square(512, "public/pwa-512x512.png");
await maskable(512, "public/pwa-maskable-512x512.png");

console.log("Generated pwa-192x192.png, pwa-512x512.png, pwa-maskable-512x512.png");
