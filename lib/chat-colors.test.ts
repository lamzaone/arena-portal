import assert from "node:assert/strict";
import test from "node:test";
import { chatColors, chatColorPreview, normalizeChatColor, normalizeChatStyle, normalizeChatBadge } from "./chat-colors.ts";

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
