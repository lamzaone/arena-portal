import { timingSafeEqual } from "node:crypto";

export function authorizeDiscordBot(request: Request): boolean {
  const secret = process.env.DISCORD_BRIDGE_SECRET;
  if (!secret || secret.length < 32) return false;
  const supplied = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
