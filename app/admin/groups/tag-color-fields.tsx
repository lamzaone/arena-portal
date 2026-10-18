"use client";

import { useId, useState } from "react";
import { Check, ChevronDown, Palette } from "lucide-react";
import { chatColors, chatColorPreview, normalizeChatColor, type ChatColor } from "@/lib/chat-colors";
import styles from "./tag-color-fields.module.css";
import { ChatEffectPreview } from "./chat-effect-preview";
import { ChatEffectEditor } from "./chat-effect-editor";

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
  const selected = options.find((color) => color.token === value);
  const previewColor = chatColorPreview(value);
  let valid = true;
  try { normalizeChatColor(value, optional); } catch { valid = false; }
  return (
    <fieldset className={styles.picker}>
      <legend>{label}</legend>
      <div className={styles.customColor}>
        <input type="color" value={previewColor} aria-label={`Choose custom ${label.toLowerCase()}`}
          onChange={(event) => onChange(event.target.value.toUpperCase())} />
        <label className={styles.colorEntry}>HEX / RGB / named token
          <input name={name} value={value} required={!optional} maxLength={64} spellCheck={false}
            placeholder={optional ? "Inherit" : "#E5AE00"} aria-invalid={!valid}
            ref={(element) => { element?.setCustomValidity(valid ? "" : "Use #RRGGBB, rgb(0, 128, 255), or a named color from the swatches."); }}
            onChange={(event) => onChange(event.target.value)} />
        </label>
      </div>
      <details>
        <summary aria-label={`${label} swatches: ${selected?.label ?? "Custom color"}`}>
          <i className={styles.swatch} style={{ backgroundColor: previewColor }} aria-hidden="true" />
          <span><strong>{selected?.label ?? "Custom color"}</strong><code>{value || "Use server / group default"}</code></span>
          <ChevronDown className={styles.chevron} aria-hidden="true" />
        </summary>
        <div className={styles.palette}>
          {options.map((color, index) => (
            <label key={color.token} className={styles.option} title={`${color.token || "Inherit"}${color.aliasOf ? ` ? Same shade as ${color.aliasOf}` : ""}`}>
              <input id={`${id}-${index}`} type="radio" name={`${id}-swatch`} value={color.token}
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

function TagColorFieldsEditor({ text = "", color = "[gold]", nameColor = "", messageColor = "",
  tagStyle = "", nameStyle = "", messageStyle = "", badgeKey = "", showSaveBar = true, textRequired = true }: {
  showSaveBar?: boolean;
  textRequired?: boolean;
  text?: string;
  color?: string;
  nameColor?: string | null;
  messageColor?: string | null;
  tagStyle?: string;
  nameStyle?: string;
  messageStyle?: string;
  badgeKey?: string;
}) {
  const channelId = useId();
  const [activeChannel, setActiveChannel] = useState<"tag" | "name" | "message">("tag");
  const [tagText, setTagText] = useState(text);
  const [tagColor, setTagColor] = useState(color);
  const [playerColor, setPlayerColor] = useState(nameColor ?? "");
  const [chatColor, setChatColor] = useState(messageColor ?? "");
  const [tagEffects, setTagEffects] = useState(tagStyle);
  const [nameEffects, setNameEffects] = useState(nameStyle);
  const [messageEffects, setMessageEffects] = useState(messageStyle);
  const [badge, setBadge] = useState(badgeKey);
  const dirty = tagText !== text || tagColor !== color || playerColor !== (nameColor ?? "") || chatColor !== (messageColor ?? "") ||
    tagEffects !== tagStyle || nameEffects !== nameStyle || messageEffects !== messageStyle || badge !== badgeKey;
  return (
    <div className={styles.fields}>
      {showSaveBar ? <div className={styles.saveBar}>
        <span role="status">{dirty ? "Unsaved changes — save to apply your settings." : "Showing current settings."}</span>
        <button type="submit">Save tag settings</button>
      </div> : null}
      <div className={styles.presentation}>
        <div className={styles.identityFields}>
          <label className={styles.textField}>Tag text
            <input name="tagText" maxLength={64} required={textRequired} placeholder="Automatic from group name" value={tagText}
              onChange={(event) => setTagText(event.target.value)} />
          </label>
          <label className={styles.textField}>Workshop badge
            <select name="badgeKey" value={badge} onChange={(event) => setBadge(event.target.value)}>
              <option value="">No badge</option><option value="tapped">TAPPED</option><option value="vip">VIP</option>
            </select>
          </label>
        </div>
        <div className={styles.preview}>
          <span className={styles.previewLabel}><Palette aria-hidden="true" /> Chat preview</span>
          <p>{badge && <span className={styles.badge} aria-label={`${badge} badge`}>{badge === "vip" ? "VIP" : "T"}</span>}{" "}
            <ChatEffectPreview value={tagEffects} color={chatColorPreview(tagColor)} text={tagText || "[TAG]"} />{" "}
            <ChatEffectPreview value={nameEffects} color={chatColorPreview(playerColor, "#B4A0FF")} text="Player" />
            <span style={{ color: "#ffffff" }}>: </span>
            <ChatEffectPreview value={messageEffects} color={chatColorPreview(chatColor)} text="Good luck, have fun!" />
          </p>
          <small>Approximate effects and badges. The Workshop HUD maps unsupported HEX colors to its 528-color palette. Inherited colors depend on server/group settings.</small>
        </div>
      </div>
      <div className={styles.channelTabs} role="group" aria-label="Chat channel">
        {([["tag", "Tag"], ["name", "Player name"], ["message", "Message"]] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={activeChannel === key} aria-controls={`${channelId}-${key}`} onClick={() => setActiveChannel(key)}>{label}</button>)}
      </div>
      <div className={styles.colorFields}>
        <div id={`${channelId}-tag`} className={styles.channel} hidden={activeChannel !== "tag"}>
          <ChatColorPicker label="Tag color" name="colorToken" value={tagColor} onChange={setTagColor} />
          <ChatEffectEditor color={chatColorPreview(tagColor)} label="Tag styles" name="tagStyle" value={tagEffects} onChange={setTagEffects} />
        </div>
        <div id={`${channelId}-name`} className={styles.channel} hidden={activeChannel !== "name"}>
          <ChatColorPicker label="Name color" name="nameColorToken" value={playerColor} onChange={setPlayerColor} optional teamColor />
          <ChatEffectEditor color={chatColorPreview(playerColor, "#B4A0FF")} label="Name styles" name="nameStyle" value={nameEffects} onChange={setNameEffects} />
        </div>
        <div id={`${channelId}-message`} className={styles.channel} hidden={activeChannel !== "message"}>
          <ChatColorPicker label="Message color" name="messageColorToken" value={chatColor} onChange={setChatColor} optional />
          <ChatEffectEditor color={chatColorPreview(chatColor)} label="Message styles" name="messageStyle" value={messageEffects} onChange={setMessageEffects} />
        </div>
      </div>
    </div>
  );
}

// Server navigation can replace a saved tag without remounting its form.
export function TagColorFields(props: Parameters<typeof TagColorFieldsEditor>[0]) {
  return <TagColorFieldsEditor key={JSON.stringify(props)} {...props} />;
}
