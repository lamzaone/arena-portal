import "server-only";

import { createHash } from "node:crypto";
import sharp from "sharp";
import type { RowDataPacket } from "mysql2/promise";
import { getPortalDatabasePool } from "./database-pools";

export class GroupBadgeSymbolError extends Error {
  constructor(public readonly code: "badge_symbol_invalid" | "badge_symbol_storage", message: string) {
    super(message);
    this.name = "GroupBadgeSymbolError";
  }
}

export async function readGroupBadgeForm(request: Request): Promise<FormData> {
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (!reader) throw new GroupBadgeSymbolError("badge_symbol_invalid", "The form is empty.");
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 512 * 1024) {
        await reader.cancel();
        throw new GroupBadgeSymbolError("badge_symbol_invalid", "The form exceeds the upload limit.");
      }
      chunks.push(value);
    }
    return await new Response(Buffer.concat(chunks), { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData();
  } catch (error) {
    if (error instanceof GroupBadgeSymbolError) throw error;
    throw new GroupBadgeSymbolError("badge_symbol_invalid", "The form could not be read.");
  } finally { reader.releaseLock(); }
}

export async function normalizeGroupBadgeSymbol(file: File): Promise<Buffer> {
  if (file.size < 1 || file.size > 256 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new GroupBadgeSymbolError("badge_symbol_invalid", "Choose a PNG, WebP or JPG image up to 256 KB.");
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const isWebp = bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
  if (!(file.type === "image/png" && isPng || file.type === "image/jpeg" && isJpeg || file.type === "image/webp" && isWebp)) {
    throw new GroupBadgeSymbolError("badge_symbol_invalid", "The image contents do not match its format.");
  }
  try {
    const image = sharp(bytes, { limitInputPixels: 1024 * 1024, animated: false, failOn: "error" });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || metadata.width > 512 || metadata.height > 512 || (metadata.pages ?? 1) > 1) throw new Error("Image dimensions exceed the limit.");
    return await image.rotate().resize(128, 128, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ compressionLevel: 9 }).toBuffer();
  } catch {
    throw new GroupBadgeSymbolError("badge_symbol_invalid", "Choose a valid, still image no larger than 512 × 512 pixels.");
  }
}

export async function saveGroupBadgeSymbol(file: File, actorSteamId: string): Promise<string> {
  const png = await normalizeGroupBadgeSymbol(file);
  const pool = getPortalDatabasePool();
  if (!pool) throw new GroupBadgeSymbolError("badge_symbol_storage", "Custom symbol storage is unavailable.");
  const id = createHash("sha256").update(png).digest("hex").slice(0, 24);
  try {
    await pool.execute("INSERT IGNORE INTO portal_group_badge_symbols (symbol_id, png_bytes, created_by_steam_id) VALUES (?, ?, ?)", [id, png, actorSteamId]);
  } catch {
    throw new GroupBadgeSymbolError("badge_symbol_storage", "Custom symbol storage is unavailable.");
  }
  return `custom.${id}`;
}

export async function readGroupBadgeSymbol(id: string): Promise<Buffer | null> {
  if (!/^[a-f0-9]{24}$/.test(id)) return null;
  const pool = getPortalDatabasePool();
  if (!pool) return null;
  try {
    const [rows] = await pool.query<Array<RowDataPacket & { png_bytes: Buffer }>>("SELECT png_bytes FROM portal_group_badge_symbols WHERE symbol_id = ? LIMIT 1", [id]);
    return rows[0]?.png_bytes ?? null;
  } catch { return null; }
}
