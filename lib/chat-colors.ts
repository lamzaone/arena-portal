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
export const paletteEffects = ["gradient", "shimmer", "cycle", "wave"] as const;
export const chatEffectNames = ["glow", "gradient", "shimmer", "pulse", "cycle", "wave", "sparkle"] as const;
export type ChatEffectName = typeof chatEffectNames[number];
export const effectControls: Record<ChatEffectName, readonly string[]> = {
  glow: ["c", "i", "r"], gradient: ["c", "d"], shimmer: ["c", "f", "d"],
  pulse: ["f", "i"], cycle: ["c", "f", "m"], wave: ["c", "f", "i", "d"], sparkle: ["f", "i"],
};
export type ChatEffectOptions = { colors: string[]; frequency: number; intensity: number; radius: number;
  direction: "forward" | "reverse"; mode: "smooth" | "steps" };
export const effectFrequencies = [0.1, 0.25, 0.5, 1, 2] as const;
export const defaultEffectColors = ["#38BDF8", "#A78BFA", "#F472B6"];
export type ChatStyle = typeof chatStyles[number];
export const chatBadges = ["", "tapped", "vip"] as const;
export type ChatBadge = typeof chatBadges[number];

export function normalizeChatStyle(value: unknown): string {
  const input = String(value ?? "").trim().toLowerCase();
  if (!input) return "";
  if (input.length > 2048) throw new Error("Too many chat effect settings.");
  const selected = new Set<string>();
  const options = new Map<string, string>();
  for (const part of input.split(/\s+/)) {
    if (chatStyles.includes(part as ChatStyle)) { selected.add(part); continue; }
    const [key, value, extra] = part.split("=");
    if (!value || extra !== undefined || options.has(key)) throw new Error("Not a supported chat style.");
    const [effect, option] = key.split(".");
    if (option) {
      if (!chatEffectNames.includes(effect as ChatEffectName) || !effectControls[effect as ChatEffectName].includes(option)) throw new Error("That setting does not apply to this effect.");
      const valid = option === "c" ? (effect === "glow" ? /^(follow|[a-f0-9]{6})$/.test(value) : /^[a-f0-9]{6}(,[a-f0-9]{6}){0,5}$/.test(value))
        : option === "f" ? effectFrequencies.some((rate) => String(rate) === value)
        : option === "i" || option === "r" ? /^[123]$/.test(value)
        : option === "d" ? ["forward", "reverse"].includes(value)
        : option === "m" && ["smooth", "steps"].includes(value);
      if (!valid || key.split(".").length !== 2) throw new Error("Not a supported effect setting.");
      options.set(key, option === "c" && value !== "follow" ? value.toUpperCase() : value);
    }
    else if (key === "c" && /^[a-f0-9]{6}(,[a-f0-9]{6}){0,5}$/.test(value)) options.set(key, value.toUpperCase());
    else if (key === "f" && effectFrequencies.some((rate) => String(rate) === value)) options.set(key, value);
    else if (key === "i" && /^[123]$/.test(value)) options.set(key, value);
    else throw new Error("Not a supported chat style.");
  }
  const result = [...chatStyles.filter((style) => selected.has(style)),
    ...["c", "f", "i", ...chatEffectNames.flatMap((effect) => effectControls[effect].map((key) => `${effect}.${key}`))]
      .filter((key) => options.has(key)).map((key) => `${key}=${options.get(key)}`)].join(" ");
  // Migration 034 expands existing fields while preserving all old values.
  if (result.length > 1024) throw new Error("Too many combined chat effects.");
  return result;
}

export function getChatEffectOptions(style: string, effect: ChatEffectName): ChatEffectOptions {
  const legacy = chatEffectOptions(style);
  const parts = new Map(style.split(/\s+/).filter((part) => part.includes("=")).map((part) => part.split("=", 2) as [string, string]));
  const configured = parts.get(`${effect}.c`);
  const palette = paletteEffects.includes(effect as typeof paletteEffects[number]);
  const colors = configured === "follow" ? [] : configured ? configured.split(",").map((color) => `#${color}`)
    : effect === "glow" ? legacy.colors.slice(0, 1) : palette ? legacy.colors.length ? legacy.colors : [...defaultEffectColors] : [];
  return { colors, frequency: Number(parts.get(`${effect}.f`) ?? legacy.frequency), intensity: Number(parts.get(`${effect}.i`) ?? legacy.intensity),
    radius: Number(parts.get(`${effect}.r`) ?? 1), direction: parts.get(`${effect}.d`) === "reverse" ? "reverse" : "forward",
    mode: parts.get(`${effect}.m`) === "steps" ? "steps" : "smooth" };
}

export function updateChatEffect(style: string, effect: ChatEffectName, next: ChatEffectOptions): string {
  const parts = style.split(/\s+/);
  const flags = parts.filter((part) => chatStyles.includes(part as ChatStyle));
  const configured = chatEffectNames.filter((name) => name === effect || flags.includes(name) || parts.some((part) => part.startsWith(`${name}.`)));
  const settings = configured.flatMap((name) => {
    const options = name === effect ? next : getChatEffectOptions(style, name);
    const values: Record<string, string | number> = { c: options.colors.length ? options.colors.map((color) => color.replace("#", "")).join(",") : "follow",
      f: options.frequency, i: options.intensity, r: options.radius, d: options.direction, m: options.mode };
    return effectControls[name].map((key) => `${name}.${key}=${values[key]}`);
  });
  return normalizeChatStyle([...flags, ...settings].join(" "));
}

export function toggleChatStyle(style: string, option: ChatStyle) {
  const parts = style.split(/\s+/).filter(Boolean);
  const selected = new Set(parts.filter((part) => chatStyles.includes(part as ChatStyle)));
  if (selected.has(option)) selected.delete(option);
  else {
    if (paletteEffects.includes(option as typeof paletteEffects[number])) paletteEffects.forEach((effect) => selected.delete(effect));
    selected.add(option);
  }
  return normalizeChatStyle([...selected, ...parts.filter((part) => part.includes("="))].join(" "));
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
