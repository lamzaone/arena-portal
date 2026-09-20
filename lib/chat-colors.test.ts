import assert from "node:assert/strict";
import test from "node:test";
import { chatColors, chatColorPreview, normalizeChatColor, normalizeChatStyle, normalizeChatBadge, withChatEffectOptions, chatEffectOptions, getChatEffectOptions, updateChatEffect, toggleChatStyle, chatEffectNames } from "./chat-colors.ts";

// Named Workshop chat tokens; teamcolor is resolved for names by GlobalChatTags.
const supported = ["[default]", "[/]", "[white]", "[darkred]", "[lightpurple]", "[green]",
  "[olive]", "[lime]", "[red]", "[gray]", "[grey]", "[lightyellow]", "[yellow]",
  "[silver]", "[bluegrey]", "[lightblue]", "[blue]", "[darkblue]", "[purple]",
  "[magenta]", "[lightred]", "[gold]", "[orange]", "[teamcolor]"];

test("every supported engine token can be selected and saved without losing its alias", () => {
  for (const token of supported) {
    assert.ok(chatColors.some((color) => color.token === token), `Missing picker option: ${token}`);
    assert.equal(normalizeChatColor(` ${token.toUpperCase()} `), token);
  }
  assert.equal(new Set(chatColors.map((color) => color.token)).size, chatColors.length);
});

test("inherit is allowed only for optional name and message colors", () => {
  assert.equal(normalizeChatColor("", true), null);
  assert.equal(normalizeChatColor(undefined, true), null);
  assert.throws(() => normalizeChatColor(""), /supported chat color/);
});

test("HTML, arbitrary tokens and control characters cannot be saved as chat colors", () => {
  for (const value of ["#abc", "#FF5733;", "rgb(256,0,0)", "rgb(1.5,2,3)", "[rainbow]", "<span color='red'>", "\x07", "[red][blue]"]) {
    assert.throws(() => normalizeChatColor(value), /supported chat color/);
  }
});

test("engine aliases have identical preview shades", () => {
  for (const [first, second] of [["[blue]", "[darkblue]"], ["[lightblue]", "[bluegrey]"],
    ["[grey]", "[gray]"], ["[yellow]", "[lightyellow]"],
    ["[purple]", "[magenta]"], ["[default]", "[/]"]]) {
    assert.equal(chatColorPreview(first), chatColorPreview(second));
  }
  assert.equal(chatColorPreview("", "#abcdef"), "#abcdef");
});

test("arbitrary six-digit HEX and integer RGB normalize losslessly", () => {
  assert.equal(normalizeChatColor(" #ab12Ef "), "#AB12EF");
  assert.equal(normalizeChatColor(" RGB(0, 128, 255) "), "#0080FF");
  assert.equal(chatColorPreview("#AB12EF"), "#AB12EF");
  assert.equal(chatColorPreview("rgb(0, 128, 255)"), "#0080FF");
  assert.equal(normalizeChatColor("[black]"), "[black]");
  assert.equal(normalizeChatColor("[brown]"), "[brown]");
});

test("styles have stable order and reject arbitrary CSS", () => {
  assert.equal(normalizeChatStyle(" PULSE bold bold italic underline glow shimmer gradient "), "bold italic underline glow gradient shimmer pulse");
  assert.equal(normalizeChatStyle(undefined), "");
  for (const value of ["color:red", "bold;", "<b>", "rainbow", "bold\x00"]) assert.throws(() => normalizeChatStyle(value));
});

test("badges only accept installed assets", () => {
  for (const value of ["", "tapped", "vip"]) assert.equal(normalizeChatBadge(value), value);
  assert.equal(normalizeChatBadge(" VIP "), "vip");
  for (const value of ["admin", "../vip", "https://example.com/icon.svg"]) assert.throws(() => normalizeChatBadge(value));
});

test("effect palettes, frequency and intensity round trip inside existing storage", () => {
  assert.equal(normalizeChatStyle("glow cycle c=ff0000,00ff00 f=0.5 i=2"), "glow cycle c=FF0000,00FF00 f=0.5 i=2");
  for (const value of ["cycle c=xyz", "cycle c=", "cycle f=0", "wave f=NaN", "glow i=9", "cycle c=FF0000 c=00FF00", "cycle c=" + Array(7).fill("FF0000").join(",")]) {
    assert.throws(() => normalizeChatStyle(value));
  }
  for (const effect of ["cycle", "wave", "sparkle"]) assert.equal(normalizeChatStyle(effect), effect);
  const largest = withChatEffectOptions("bold italic underline glow pulse gradient shimmer", { colors: Array(6).fill("#ABCDEF"), frequency: .25, intensity: 3 });
  assert.ok(largest.length <= 96);
  assert.deepEqual(chatEffectOptions(largest), { colors: Array(6).fill("#ABCDEF"), frequency: .25, intensity: 3 });
});

test("effects accept only their own controls and preserve independent saved values", () => {
  assert.equal(normalizeChatStyle("glow pulse glow.c=ff0000 glow.i=2 glow.r=3 pulse.f=0.25 pulse.i=3"),
    "glow pulse glow.c=FF0000 glow.i=2 glow.r=3 pulse.f=0.25 pulse.i=3");
  for (const style of ["glow glow.f=1", "gradient gradient.f=1", "pulse pulse.c=FF0000", "cycle cycle.i=3", "wave wave.d=bad"]) {
    assert.throws(() => normalizeChatStyle(style));
  }
});

test("editing legacy shared settings freezes the other effects and disabling retains each configuration", () => {
  const before = "glow pulse cycle c=FF0000,00FF00 f=0.25 i=3";
  const after = updateChatEffect(before, "pulse", { ...getChatEffectOptions(before, "pulse"), frequency: 2, intensity: 1 });
  assert.equal(getChatEffectOptions(after, "pulse").frequency, 2);
  assert.equal(getChatEffectOptions(after, "glow").intensity, 3);
  assert.deepEqual(getChatEffectOptions(after, "cycle").colors, ["#FF0000", "#00FF00"]);
  assert.equal(getChatEffectOptions(after, "cycle").frequency, .25);
  assert.equal(toggleChatStyle(toggleChatStyle(after, "pulse"), "pulse"), after);
  const gradient = toggleChatStyle(after, "gradient");
  assert.ok(!gradient.split(" ").includes("cycle"));
  assert.deepEqual(getChatEffectOptions(gradient, "cycle"), getChatEffectOptions(after, "cycle"));
});

test("every effect can retain maximum palettes and independent settings within expanded storage", () => {
  let style = "bold italic underline glow pulse wave sparkle";
  for (const effect of chatEffectNames) {
    const options = getChatEffectOptions(style, effect);
    style = updateChatEffect(style, effect, { ...options, frequency: 2, intensity: 3, radius: 3,
      colors: effect === "glow" ? ["#112233"] : options.colors.length ? Array(6).fill("#ABCDEF") : [], direction: "reverse", mode: "steps" });
  }
  assert.ok(style.length > 96 && style.length <= 1024);
  assert.equal(normalizeChatStyle(style), style);
  assert.equal(getChatEffectOptions(style, "shimmer").colors.length, 6);
  assert.equal(getChatEffectOptions(style, "glow").radius, 3);
});
