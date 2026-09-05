import assert from "node:assert/strict";
import test from "node:test";
import { chatColors, chatColorPreview, normalizeChatColor } from "./chat-colors.ts";

// SwiftlyS2 Helper.ColorCodes, including aliases; teamcolor is provided by GlobalChatTags.
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

test("hex, HTML, arbitrary tokens and control characters cannot be saved as chat colors", () => {
  for (const value of ["#FF5733", "[rainbow]", "<span color='red'>", "\x07", "[red][blue]"]) {
    assert.throws(() => normalizeChatColor(value), /supported chat color/);
  }
});

test("engine aliases have identical preview shades", () => {
  for (const [first, second] of [["[gold]", "[orange]"], ["[blue]", "[lightblue]"],
    ["[grey]", "[gray]"], ["[silver]", "[bluegrey]"], ["[yellow]", "[lightyellow]"],
    ["[purple]", "[magenta]"], ["[default]", "[/]"]]) {
    assert.equal(chatColorPreview(first), chatColorPreview(second));
  }
  assert.equal(chatColorPreview("", "#abcdef"), "#abcdef");
});
