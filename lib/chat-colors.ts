export type ChatColor = {
  token: string;
  label: string;
  preview: string;
  aliasOf?: string;
};

// Match TAPPED.HtmlChatProbe/Rendering/ChatColors.cs. The Workshop HUD maps
// arbitrary HEX colors to its compiled 528-color palette; preview uses requested RGB.
export const chatColors: readonly ChatColor[] = [
  { token: "[default]", label: "Default", preview: "#ffffff" },
  { token: "[white]", label: "White", preview: "#ffffff", aliasOf: "Default" },
  { token: "[/]", label: "Reset", preview: "#ffffff", aliasOf: "Default" },
  { token: "[grey]", label: "Grey", preview: "#C0C0C0" },
  { token: "[gray]", label: "Gray", preview: "#C0C0C0", aliasOf: "Grey" },
  { token: "[silver]", label: "Silver", preview: "#A0A0A4" },
  { token: "[bluegrey]", label: "Blue grey", preview: "#99CCFF", aliasOf: "Light blue" },
  { token: "[darkred]", label: "Dark red", preview: "#FF0000" },
  { token: "[red]", label: "Red", preview: "#FF4040" },
  { token: "[lightred]", label: "Light red", preview: "#FFB2B2" },
  { token: "[gold]", label: "Gold", preview: "#E5AE00" },
  { token: "[orange]", label: "Orange", preview: "#FF9900" },
  { token: "[yellow]", label: "Yellow", preview: "#FFFF00" },
  { token: "[lightyellow]", label: "Light yellow", preview: "#FFFF00", aliasOf: "Yellow" },
  { token: "[olive]", label: "Olive", preview: "#BFFF00" },
  { token: "[green]", label: "Green", preview: "#40ff40" },
  { token: "[lime]", label: "Lime", preview: "#A4FF47" },
  { token: "[blue]", label: "Blue", preview: "#3D6DFF" },
  { token: "[lightblue]", label: "Light blue", preview: "#99CCFF" },
  { token: "[darkblue]", label: "Dark blue", preview: "#3D6DFF", aliasOf: "Blue" },
  { token: "[lightpurple]", label: "Light purple", preview: "#B4A0FF" },
  { token: "[purple]", label: "Purple", preview: "#FF00FF" },
  { token: "[magenta]", label: "Magenta", preview: "#FF00FF", aliasOf: "Purple" },
  { token: "[black]", label: "Black", preview: "#000000" },
  { token: "[brown]", label: "Brown", preview: "#92400E" },
  // GlobalChatTags resolves this special token for player names, not tag/message text.
  { token: "[teamcolor]", label: "Team color", preview: "#B4A0FF" },
];

const tokens = new Set(chatColors.map((color) => color.token));

export function normalizeChatColor(value: unknown, optional = false): string | null {
  const token = String(value ?? "").trim().toLowerCase();
  if (!token && optional) return null;
  if (/^#[0-9a-f]{6}$/.test(token)) return token.toUpperCase();
  const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(token);
  if (rgb && rgb.slice(1).every((part) => Number(part) <= 255)) {
    return `#${rgb.slice(1).map((part) => Number(part).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
  }
  if (!tokens.has(token)) throw new Error("Not a supported chat color.");
  return token;
}

export function chatColorPreview(token: string, fallback = "#ffffff"): string {
  try { token = normalizeChatColor(token, true) ?? ""; } catch { return fallback; }
  if (/^#[0-9a-f]{6}$/i.test(token)) return token.toUpperCase();
  return chatColors.find((color) => color.token === token)?.preview ?? fallback;
}

export const chatStyles = ["bold", "italic", "underline", "glow", "gradient", "shimmer", "pulse"] as const;
export type ChatStyle = typeof chatStyles[number];
export const chatBadges = ["", "tapped", "vip"] as const;
export type ChatBadge = typeof chatBadges[number];

export function normalizeChatStyle(value: unknown): string {
  const input = String(value ?? "").trim().toLowerCase();
  if (!input) return "";
  const selected = new Set(input.split(/\s+/));
  if ([...selected].some((style) => !chatStyles.includes(style as ChatStyle))) {
    throw new Error("Not a supported chat style.");
  }
  return chatStyles.filter((style) => selected.has(style)).join(" ");
}

export function normalizeChatBadge(value: unknown): ChatBadge {
  const badge = String(value ?? "").trim().toLowerCase();
  if (!chatBadges.includes(badge as ChatBadge)) throw new Error("Not a supported chat badge.");
  return badge as ChatBadge;
}
