import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// All browser and preview assets are rendered from the transparent master SVG.
const branding = new URL("../public/images/branding/", import.meta.url);
const source = new URL("tapped-emblem.svg", branding);

async function render(size) {
  return sharp(fileURLToPath(source), { density: 144 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

await mkdir(branding, { recursive: true });
await writeFile(new URL("apple-touch-icon.png", branding), await render(180));
await writeFile(new URL("tapped-emblem-512.png", branding), await render(512));

const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map(render));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
images.forEach((png, index) => {
  const entry = 6 + index * 16;
  header[entry] = sizes[index];
  header[entry + 1] = sizes[index];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(png.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += png.length;
});
await writeFile(new URL("../public/favicon.ico", import.meta.url), Buffer.concat([header, ...images]));
console.log("Generated transparent favicon, Apple touch icon, and preview image from tapped-emblem.svg.");
