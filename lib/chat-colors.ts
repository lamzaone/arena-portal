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

export const chatStyles = ["bold", "italic", "underline", "glow", "gradient", "shimmer", "pulse", "cycle", "wave", "sparkle"] as const;
export const paletteEffects = ["gradient", "shimmer", "cycle", "wave", "sparkle"] as const;
export const effectFrequencies = [0.1, 0.25, 0.5, 1, 2] as const;
export const defaultEffectColors = ["#38BDF8", "#A78BFA", "#F472B6"];
export type ChatStyle = typeof chatStyles[number];
export const chatBadges = ["", "tapped", "vip"] as const;
export type ChatBadge = typeof chatBadges[number];

export function normalizeChatStyle(value: unknown): string {
  const input = String(value ?? "").trim().toLowerCase();
  if (!input) return "";
  const selected = new Set<string>();
  const options = new Map<string, string>();
  for (const part of input.split(/\s+/)) {
    if (chatStyles.includes(part as ChatStyle)) { selected.add(part); continue; }
    const [key, value, extra] = part.split("=");
    if (!value || extra !== undefined || options.has(key)) throw new Error("Not a supported chat style.");
    if (key === "c" && /^[a-f0-9]{6}(,[a-f0-9]{6}){0,5}$/.test(value)) options.set(key, value.toUpperCase());
    else if (key === "f" && effectFrequencies.some((rate) => String(rate) === value)) options.set(key, value);
    else if (key === "i" && /^[123]$/.test(value)) options.set(key, value);
    else throw new Error("Not a supported chat style.");
  }
  const result = [...chatStyles.filter((style) => selected.has(style)),
    ...["c", "f", "i"].filter((key) => options.has(key)).map((key) => `${key}=${options.get(key)}`)].join(" ");
  // Existing portal columns are VARCHAR(96); never allow silent truncation.
  if (result.length > 96) throw new Error("Too many combined chat effects.");
  return result;
}

export function chatEffectOptions(style: string) {
  const parts = style.split(/\s+/);
  const colors = parts.find((part) => part.startsWith("c="))?.slice(2).split(",").map((color) => `#${color}`) ?? [];
  return { colors, frequency: Number(parts.find((part) => part.startsWith("f="))?.slice(2) ?? 0.5),
    intensity: Number(parts.find((part) => part.startsWith("i="))?.slice(2) ?? 1) };
}

export function withChatEffectOptions(style: string, options: ReturnType<typeof chatEffectOptions>) {
  let flags = style.split(/\s+/).filter((part) => chatStyles.includes(part as ChatStyle));
  // Older rows could combine multiple palette modes. Keep the last mode when
  // editing options so every six-color configuration still fits VARCHAR(96).
  const modes = flags.filter((part) => paletteEffects.includes(part as typeof paletteEffects[number]));
  flags = flags.filter((part) => !modes.includes(part) || part === modes.at(-1));
  return normalizeChatStyle([...flags, ...(options.colors.length ? [`c=${options.colors.map((color) => color.replace("#", "")).join(",")}`] : []),
    ...(options.frequency !== 0.5 ? [`f=${options.frequency}`] : []), ...(options.intensity !== 1 ? [`i=${options.intensity}`] : [])].join(" "));
}

export function normalizeChatBadge(value: unknown): ChatBadge {
  const badge = String(value ?? "").trim().toLowerCase();
  if (!chatBadges.includes(badge as ChatBadge)) throw new Error("Not a supported chat badge.");
  return badge as ChatBadge;
}
