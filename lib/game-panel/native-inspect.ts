import { toGameCommand } from "@skinhub/cdn/inspect";
import { weaponInspectLink, weaponPreviewItem, type WeaponPreviewSource } from "../economy/weapon-preview";

export function nativeInspectCommand(source: WeaponPreviewSource): string | null {
  const item = weaponPreviewItem(source);
  const link = item ? weaponInspectLink(item) : null;
  if (!link) return null;
  const command = toGameCommand(link);
  return /^csgo_econ_action_preview (?:[0-9A-F]{2}){8,2048}$/i.test(command) ? command : null;
}
