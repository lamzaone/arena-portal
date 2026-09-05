export type ChatColor = {
  token: string;
  label: string;
  preview: string;
  aliasOf?: string;
};

// Match SwiftlyS2 Helper.ColorCodes. Hex values are browser preview approximations,
// never sent to the game. Aliases intentionally share the same preview shade.
export const chatColors: readonly ChatColor[] = [
  { token: "[default]", label: "Default", preview: "#ffffff" },
  { token: "[white]", label: "White", preview: "#ffffff", aliasOf: "Default" },
  { token: "[/]", label: "Reset", preview: "#ffffff", aliasOf: "Default" },
  { token: "[grey]", label: "Grey", preview: "#c4c4c4" },
  { token: "[gray]", label: "Gray", preview: "#c4c4c4", aliasOf: "Grey" },
  { token: "[silver]", label: "Silver", preview: "#b0c3d9" },
  { token: "[bluegrey]", label: "Blue grey", preview: "#b0c3d9", aliasOf: "Silver" },
  { token: "[darkred]", label: "Dark red", preview: "#ff4040" },
  { token: "[red]", label: "Red", preview: "#ff7070" },
  { token: "[lightred]", label: "Light red", preview: "#eb4b4b" },
  { token: "[gold]", label: "Gold", preview: "#e4ae39" },
  { token: "[orange]", label: "Orange", preview: "#e4ae39", aliasOf: "Gold" },
  { token: "[yellow]", label: "Yellow", preview: "#f8f49a" },
  { token: "[lightyellow]", label: "Light yellow", preview: "#f8f49a", aliasOf: "Yellow" },
  { token: "[olive]", label: "Olive", preview: "#a3bd67" },
  { token: "[green]", label: "Green", preview: "#40ff40" },
  { token: "[lime]", label: "Lime", preview: "#a1ff4f" },
  { token: "[blue]", label: "Blue", preview: "#5e98d9" },
  { token: "[lightblue]", label: "Light blue", preview: "#5e98d9", aliasOf: "Blue" },
  { token: "[darkblue]", label: "Dark blue", preview: "#4b69ff" },
  { token: "[lightpurple]", label: "Light purple", preview: "#c8a2c8" },
  { token: "[purple]", label: "Purple", preview: "#e03fff" },
  { token: "[magenta]", label: "Magenta", preview: "#e03fff", aliasOf: "Purple" },
  // GlobalChatTags resolves this special token for player names, not tag/message text.
  { token: "[teamcolor]", label: "Team color", preview: "#9fcaff" },
];

const tokens = new Set(chatColors.map((color) => color.token));

export function normalizeChatColor(value: unknown, optional = false): string | null {
  const token = String(value ?? "").trim().toLowerCase();
  if (!token && optional) return null;
  if (!tokens.has(token)) throw new Error("Not a supported chat color.");
  return token;
}

export function chatColorPreview(token: string, fallback = "#ffffff"): string {
  return chatColors.find((color) => color.token === token)?.preview ?? fallback;
}
