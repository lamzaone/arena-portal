"use client";

import { useEffect, useState } from "react";
import { chatStyles, chatEffectNames, defaultEffectColors, effectControls, effectFrequencies,
  getChatEffectOptions, updateChatEffect, toggleChatStyle, type ChatEffectName, type ChatEffectOptions } from "@/lib/chat-colors";
import styles from "./tag-color-fields.module.css";

const descriptions: Record<ChatEffectName, string> = {
  glow: "A soft halo around the letters. Keeps the text color unchanged.",
  gradient: "A still blend of colors across the text.",
  shimmer: "Colors travel across the letters in a repeating sweep.",
  pulse: "The text gently brightens and returns to normal.",
  cycle: "The whole text cycles through your colors together.",
  wave: "A moving color wave with a brighter crest.",
  sparkle: "Brief highlights that leave the text readable between flashes.",
};
const strength = ["Soft", "Medium", "Strong"];
function ColorField({ label, color, onChange }: { label: string; color: string; onChange: (color: string) => void }) {
  const [draft, setDraft] = useState(color);
  useEffect(() => setDraft(color), [color]);
  return <div className={styles.effectColorInputs}>
    <input type="color" aria-label={label} value={color} onChange={(event) => onChange(event.target.value.toUpperCase())} />
    <input type="text" aria-label={`${label} HEX`} value={draft} maxLength={7} pattern="#[0-9A-Fa-f]{6}" required spellCheck={false}
      onChange={(event) => { const next = event.target.value; setDraft(next); if (/^#[a-f\d]{6}$/i.test(next)) onChange(next.toUpperCase()); }} />
  </div>;
}

export function ChatEffectEditor({ label, name, value, color, onChange }: {
  label: string; name: string; value: string; color: string; onChange: (value: string) => void;
}) {
  const selected = new Set(value.split(" "));
  return <fieldset className={styles.stylePicker}>
    <legend>{label}</legend>
    <input type="hidden" name={name} value={value} />
    <div className={styles.styleButtons}>
      {chatStyles.slice(0, 3).map((style) => <button key={style} type="button" aria-pressed={selected.has(style)}
        onClick={() => onChange(toggleChatStyle(value, style))}>{style}</button>)}
    </div>
    <p className={styles.effectHelp}>Each effect keeps its own settings. Choose one color effect; combine it with glow, pulse or sparkle.</p>
    <div className={styles.effectCards}>
      {chatEffectNames.map((effect) => {
        const options = getChatEffectOptions(value, effect);
        const enabled = selected.has(effect);
        const title = effect[0].toUpperCase() + effect.slice(1);
        const prefix = `${label} ${title}`;
        const controls = effectControls[effect];
        const update = (patch: Partial<ChatEffectOptions>) => onChange(updateChatEffect(value, effect, { ...options, ...patch }));
        const effectiveColors = effect === "glow" ? [options.colors[0] ?? color] : options.colors;
        const summary = [controls.includes("c") ? effect === "glow" ? `${options.colors.length ? options.colors[0] : `Text color (${color})`}` : `${options.colors.length} colors` : "",
          controls.includes("f") ? `${options.frequency} Hz / ${1 / options.frequency}s` : "",
          controls.includes("i") ? strength[options.intensity - 1] : "", controls.includes("r") ? `${options.radius + 1}px halo` : "",
          controls.includes("d") ? options.direction === "reverse" ? "Right to left" : "Left to right" : "",
          controls.includes("m") ? options.mode === "steps" ? "Stepped" : "Smooth" : ""].filter(Boolean).join(" · ");
        return <section className={styles.effectCard} data-enabled={enabled} key={effect} aria-label={`${prefix} effect`}>
          <div className={styles.effectHeading}><strong>{title}</strong>
            <button type="button" aria-label={`${title}`} aria-pressed={enabled} onClick={() => onChange(toggleChatStyle(value, effect))}>{enabled ? "On" : "Off"}</button>
          </div>
          <p className={styles.effectDescription}>{descriptions[effect]}</p>
          <div className={styles.effectCurrent}>
            {controls.includes("c") && <span className={styles.miniPalette} aria-hidden="true">{effectiveColors.map((entry, index) => <i key={index} style={{ background: entry }} />)}</span>}
            <span>{summary}</span>
          </div>
          <details key={`${effect}-${enabled}`} open={enabled}>
            <summary>{title} settings</summary>
            <div className={styles.effectSettings}>
              {controls.includes("f") && <label>{effect === "pulse" ? "Pulse frequency" : effect === "sparkle" ? "Sparkle frequency" : "Cycle frequency"}
                <select aria-label={`${prefix} frequency`} value={options.frequency} onChange={(event) => update({ frequency: Number(event.target.value) })}>
                  {effectFrequencies.map((rate) => <option key={rate} value={rate}>{rate} Hz · {1 / rate}s per cycle</option>)}
                </select>
              </label>}
              {controls.includes("i") && <label>{effect === "glow" ? "Glow strength" : effect === "wave" ? "Crest brightness" : "Highlight strength"}
                <select aria-label={`${prefix} intensity`} value={options.intensity} onChange={(event) => update({ intensity: Number(event.target.value) })}>
                  {strength.map((entry, index) => <option key={entry} value={index + 1}>{entry}</option>)}
                </select>
              </label>}
              {controls.includes("r") && <label>Halo size
                <select aria-label={`${prefix} size`} value={options.radius} onChange={(event) => update({ radius: Number(event.target.value) })}>
                  <option value={1}>Tight · 2px</option><option value={2}>Medium · 3px</option><option value={3}>Wide · 4px</option>
                </select>
              </label>}
              {controls.includes("d") && <label>Direction
                <select aria-label={`${prefix} direction`} value={options.direction} onChange={(event) => update({ direction: event.target.value as ChatEffectOptions["direction"] })}>
                  <option value="forward">Left to right</option><option value="reverse">Right to left</option>
                </select>
              </label>}
              {controls.includes("m") && <label>Color transitions
                <select aria-label={`${prefix} transition`} value={options.mode} onChange={(event) => update({ mode: event.target.value as ChatEffectOptions["mode"] })}>
                  <option value="smooth">Smooth blend</option><option value="steps">Distinct steps</option>
                </select>
              </label>}
              {controls.includes("c") && <div className={styles.effectPalette}>
                {effect === "glow" ? <>
                  <label className={styles.followColor}><input type="checkbox" checked={!options.colors.length} onChange={(event) => update({ colors: event.target.checked ? [] : [color] })} /> Follow text color</label>
                  <ColorField label={`${prefix} color`} color={effectiveColors[0]} onChange={(next) => update({ colors: [next] })} />
                </> : <>
                  <span>Palette <small>{options.colors.length}/6 colors</small></span>
                  {options.colors.map((entry, index) => <div className={styles.effectColor} key={index}>
                    <ColorField label={`${prefix} color ${index + 1}`} color={entry} onChange={(next) => update({ colors: options.colors.map((old, i) => i === index ? next : old) })} />
                    <button type="button" disabled={index === 0} aria-label={`Move ${prefix} color ${index + 1} earlier`} onClick={() => {
                      const colors = [...options.colors]; [colors[index - 1], colors[index]] = [colors[index], colors[index - 1]]; update({ colors });
                    }}>↑</button>
                    <button type="button" disabled={options.colors.length === 1} aria-label={`Remove ${prefix} color ${index + 1}`}
                      onClick={() => update({ colors: options.colors.filter((_, i) => i !== index) })}>×</button>
                  </div>)}
                  <div className={styles.styleButtons}>
                    <button type="button" disabled={options.colors.length >= 6} onClick={() => update({ colors: [...options.colors, defaultEffectColors[options.colors.length % 3]] })}>Add color</button>
                    <button type="button" onClick={() => update({ colors: [...defaultEffectColors] })}>Default palette</button>
                  </div>
                </>}
              </div>}
              <button className={styles.resetEffect} type="button" onClick={() => onChange(updateChatEffect(value, effect, getChatEffectOptions("", effect)))}>Reset {title.toLowerCase()} settings</button>
            </div>
          </details>
        </section>;
      })}
    </div>
  </fieldset>;
}
