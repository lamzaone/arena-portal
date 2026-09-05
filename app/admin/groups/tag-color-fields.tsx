"use client";

import { useId, useState } from "react";
import { Check, ChevronDown, Palette } from "lucide-react";
import { chatColors, chatColorPreview, type ChatColor } from "@/lib/chat-colors";
import styles from "./tag-color-fields.module.css";

function ChatColorPicker({ label, name, value, onChange, optional = false, teamColor = false }: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
  teamColor?: boolean;
}) {
  const id = useId();
  const options: ChatColor[] = chatColors.filter((color) =>
    color.token !== "[teamcolor]" || teamColor || value === "[teamcolor]");
  if (optional) options.unshift({ token: "", label: "Inherit", preview: "#a6a6ad" });
  // Preserve existing values rather than silently changing a saved tag on submit.
  if (!options.some((color) => color.token === value)) {
    options.unshift({ token: value, label: `Unsupported: ${value}`, preview: "#a6a6ad" });
  }
  const selected = options.find((color) => color.token === value)!;
  return (
    <fieldset className={styles.picker}>
      <legend>{label}</legend>
      <details>
        <summary aria-label={`${label}: ${selected.label}`}>
          <i className={styles.swatch} style={{ backgroundColor: selected.preview }} aria-hidden="true" />
          <span><strong>{selected.label}</strong><code>{value || "Use server / group default"}</code></span>
          <ChevronDown className={styles.chevron} aria-hidden="true" />
        </summary>
        <div className={styles.palette}>
          {options.map((color, index) => (
            <label key={color.token} className={styles.option} title={`${color.token || "Inherit"}${color.aliasOf ? ` · Same shade as ${color.aliasOf}` : ""}`}>
              <input id={`${id}-${index}`} type="radio" name={name} value={color.token}
                checked={value === color.token} onChange={() => onChange(color.token)} />
              <span className={styles.optionFace}>
                <i className={styles.swatch} style={{ backgroundColor: color.preview }} aria-hidden="true" />
                <span>{color.label}<small>{color.aliasOf ? `= ${color.aliasOf}` : color.token || "Default"}</small></span>
                {value === color.token && <Check aria-hidden="true" />}
              </span>
            </label>
          ))}
        </div>
      </details>
    </fieldset>
  );
}

export function TagColorFields({ text = "", color = "[gold]", nameColor = "", messageColor = "" }: {
  text?: string;
  color?: string;
  nameColor?: string | null;
  messageColor?: string | null;
}) {
  const [tagText, setTagText] = useState(text);
  const [tagColor, setTagColor] = useState(color);
  const [playerColor, setPlayerColor] = useState(nameColor ?? "");
  const [chatColor, setChatColor] = useState(messageColor ?? "");
  return (
    <div className={styles.fields}>
      <div className={styles.presentation}>
        <label className={styles.textField}>Tag text
          <input name="tagText" maxLength={64} required placeholder="[BETA]" value={tagText}
            onChange={(event) => setTagText(event.target.value)} />
        </label>
        <div className={styles.preview}>
          <span className={styles.previewLabel}><Palette aria-hidden="true" /> Chat preview</span>
          <p><span style={{ color: chatColorPreview(tagColor) }}>{tagText || "[TAG]"}</span>{" "}
            <span style={{ color: chatColorPreview(playerColor, "#9fcaff") }}>Player</span>
            <span style={{ color: "#ffffff" }}>: </span>
            <span style={{ color: chatColorPreview(chatColor) }}>Good luck, have fun!</span>
          </p>
          <small>Approximate in-game shades. Inherited colors depend on server/group settings.</small>
        </div>
      </div>
      <div className={styles.colorFields}>
        <ChatColorPicker label="Tag color" name="colorToken" value={tagColor} onChange={setTagColor} />
        <ChatColorPicker label="Name color" name="nameColorToken" value={playerColor} onChange={setPlayerColor} optional teamColor />
        <ChatColorPicker label="Message color" name="messageColorToken" value={chatColor} onChange={setChatColor} optional />
      </div>
    </div>
  );
}
