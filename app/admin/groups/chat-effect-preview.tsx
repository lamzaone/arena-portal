"use client";

import { useEffect, useState } from "react";
import { getChatEffectOptions } from "@/lib/chat-colors";
import styles from "./tag-color-fields.module.css";

function mix(first: string, second: string, amount: number) {
  return "#" + [1, 3, 5].map((i) => Math.round(parseInt(first.slice(i, i + 2), 16) * (1 - amount) +
    parseInt(second.slice(i, i + 2), 16) * amount).toString(16).padStart(2, "0")).join("");
}
const fraction = (value: number) => value - Math.floor(value);

export function ChatEffectPreview({ value, color, text }: { value: string; color: string; text: string }) {
  const flags = new Set(value.split(" "));
  const animated = ["shimmer", "cycle", "wave", "pulse", "sparkle"].some((flag) => flags.has(flag));
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setInterval> | undefined;
    function sync() {
      clearInterval(timer); setSeconds(0);
      if (animated && !motion.matches) timer = setInterval(() => setSeconds(performance.now() / 1000), 125);
    }
    sync(); motion.addEventListener("change", sync);
    return () => { clearInterval(timer); motion.removeEventListener("change", sync); };
  }, [animated, value]);
  const effect = (["wave", "cycle", "shimmer", "gradient"] as const).find((name) => flags.has(name));
  const options = effect ? getChatEffectOptions(value, effect) : null;
  const glow = getChatEffectOptions(value, "glow");
  const elements = Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text), (part) => part.segment);
  const count = effect && effect !== "cycle" ? Math.max(1, Math.min(6, elements.length)) : 1;
  const className = ["bold", "italic", "underline"].filter((flag) => flags.has(flag)).map((flag) => styles[`effect_${flag}`]).join(" ");
  let light = 0;
  if (flags.has("pulse")) {
    const pulse = getChatEffectOptions(value, "pulse");
    light += (1 - Math.cos(seconds * pulse.frequency * Math.PI * 2)) * .1 * pulse.intensity;
  }
  if (flags.has("sparkle")) {
    const sparkle = getChatEffectOptions(value, "sparkle");
    const phase = fraction(seconds * sparkle.frequency);
    light += Math.max(0, 1 - Math.abs(phase - .18) / .08, 1 - Math.abs(phase - .72) / .08) * .2 * sparkle.intensity;
  }
  const brightness = 1 + Math.min(30, Math.round(light * 20)) / 20;
  return <span className={className}>
    {Array.from({ length: count }, (_, i) => {
      const position = count === 1 ? 0 : i / (count - 1);
      let sampled = color;
      if (effect && options) {
        const phase = seconds * options.frequency * (options.direction === "reverse" ? -1 : 1);
        const offset = effect === "gradient" ? options.direction === "reverse" ? 1 - position : position : fraction(effect === "cycle" ? phase : position - phase);
        const palette = options.colors;
        const scaled = offset * (effect === "gradient" ? palette.length - 1 : palette.length);
        const index = Math.min(Math.floor(scaled), palette.length - 1);
        sampled = mix(palette[index], palette[(index + 1) % palette.length], effect === "cycle" && options.mode === "steps" ? 0 : scaled - index);
        if (effect === "wave") sampled = mix(sampled, "#FFFFFF", (1 + Math.sin((phase - position) * Math.PI * 2)) * .1 * options.intensity);
      }
      const shadow = flags.has("glow") ? `0 0 ${glow.radius + 1}px ${glow.colors[0] ?? sampled}${["99", "BB", "DD"][glow.intensity - 1]}` : undefined;
      return <span key={i} className={styles.previewRun} style={{ color: sampled, textShadow: shadow, filter: `brightness(${brightness})`,
        transition: options?.mode === "steps" && effect === "cycle" ? "filter .12s linear" : undefined }}>
        {elements.slice(Math.floor(i * elements.length / count), Math.floor((i + 1) * elements.length / count)).join("")}
      </span>;
    })}
  </span>;
}
