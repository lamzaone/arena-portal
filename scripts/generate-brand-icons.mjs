import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// All browser and preview assets are rendered from the transparent master SVG.
const branding = new URL("../public/images/branding/", import.meta.url);
const source = new URL("tapped-emblem.svg", branding);

async function render(size, input = fileURLToPath(source)) {
  return sharp(input, { density: 144 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

await mkdir(branding, { recursive: true });
await writeFile(new URL("apple-touch-icon.png", branding), await render(180));
await writeFile(new URL("tapped-emblem-512.png", branding), await render(512));

// Derive the crosshair-free artwork from the master so its facets stay identical.
const master = await readFile(source, "utf8");
const crosshair = /  <g id="crosshair">[\s\S]*?^  <\/g>\r?\n\r?\n/m;
if (!crosshair.test(master)) throw new Error("The master SVG must contain its removable crosshair group.");
const monogram = master
  .replace(crosshair, "")
  .replace('viewBox="350 0 850 765"', 'viewBox="390 180 800 560"')
  .replace("<title>TAPPED emblem</title>", "<title>TAPPED emblem without crosshair</title>")
  .replace(" inside a segmented crimson crosshair", "");
await writeFile(new URL("tapped-emblem-no-crosshair.svg", branding), monogram);
await writeFile(new URL("tapped-emblem-no-crosshair-512.png", branding), await render(512, Buffer.from(monogram)));

const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map((size) => render(size)));
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
console.log("Generated transparent favicon, Apple touch icon, preview images, and crosshair-free SVG from tapped-emblem.svg.");
