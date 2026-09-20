"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { chatEffectOptions, defaultEffectColors } from "@/lib/chat-colors";
import styles from "./tag-color-fields.module.css";

function mix(first: string, second: string, amount: number) {
  return "#" + [1, 3, 5].map((i) => Math.round(parseInt(first.slice(i, i + 2), 16) * (1 - amount) +
    parseInt(second.slice(i, i + 2), 16) * amount).toString(16).padStart(2, "0")).join("");
}

export function ChatEffectPreview({ value, color, text }: { value: string; color: string; text: string }) {
  const flags = new Set(value.split(" "));
  const options = chatEffectOptions(value);
  const hasEffects = ["glow", "gradient", "shimmer", "pulse", "cycle", "wave", "sparkle"].some((flag) => flags.has(flag));
  const spatial = ["gradient", "shimmer", "wave"].some((flag) => flags.has(flag));
  const animated = hasEffects && (["shimmer", "cycle", "wave"].some((flag) => flags.has(flag)) ||
    (options.colors.length > 1 && !flags.has("gradient")));
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setInterval> | undefined;
    function sync() {
      clearInterval(timer);
      setSeconds(0);
      if (animated && !motion.matches) timer = setInterval(() => setSeconds(performance.now() / 1000), 125);
    }
    sync(); motion.addEventListener("change", sync);
    return () => { clearInterval(timer); motion.removeEventListener("change", sync); };
  }, [animated, value]);
  const palette = !hasEffects ? [color] : options.colors.length ? options.colors : spatial || flags.has("cycle") ? defaultEffectColors : [color];
  const elements = Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text), (part) => part.segment);
  const count = spatial ? Math.max(1, Math.min(6, elements.length)) : 1;
  const className = ["bold", "italic", "underline", "pulse", "sparkle"].filter((flag) => flags.has(flag)).map((flag) => styles[`effect_${flag}`]).join(" ");
  const variables = { "--effect-duration": `${1 / options.frequency}s`, "--effect-blur": `${options.intensity + 1}px`,
    "--effect-peak": 1 + options.intensity * .2, "--effect-combined-peak": 1 + options.intensity * .3 } as CSSProperties;
  return <span className={className} style={variables}>
    {Array.from({ length: count }, (_, i) => {
      const position = count === 1 ? 0 : i / (count - 1);
      const phase = seconds * options.frequency;
      const offset = animated ? (phase + (flags.has("cycle") ? 0 : position)) % 1 : position;
      const scaled = offset * (animated ? palette.length : palette.length - 1);
      const index = Math.min(Math.floor(scaled), palette.length - 1);
      let sampled = mix(palette[index], palette[(index + 1) % palette.length], scaled - index);
      if (flags.has("wave")) sampled = mix(sampled, "#FFFFFF", (1 + Math.sin((phase - position) * Math.PI * 2)) * .1 * options.intensity);
      return <span key={i} className={flags.has("glow") ? styles.effect_glow : undefined}
        style={{ color: sampled, "--effect-glow": sampled } as CSSProperties}>
        {elements.slice(Math.floor(i * elements.length / count), Math.floor((i + 1) * elements.length / count)).join("")}
      </span>;
    })}
  </span>;
}
