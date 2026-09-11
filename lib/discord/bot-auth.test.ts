import assert from "node:assert/strict";
import test from "node:test";
import { authorizeDiscordBot } from "./bot-auth.ts";

test("bot bridge requires configured, strong, exact bearer credentials", () => {
  const previous = process.env.DISCORD_BRIDGE_SECRET;
  try {
    const request = (token: string) => new Request("https://portal.test/api/discord/bot/snapshot", { headers: { authorization: token } });
    delete process.env.DISCORD_BRIDGE_SECRET;
    assert.equal(authorizeDiscordBot(request("Bearer undefined")), false);
    process.env.DISCORD_BRIDGE_SECRET = "short";
    assert.equal(authorizeDiscordBot(request("Bearer short")), false);
    process.env.DISCORD_BRIDGE_SECRET = "a".repeat(48);
    assert.equal(authorizeDiscordBot(request(`Bearer ${"a".repeat(48)}`)), true);
    assert.equal(authorizeDiscordBot(request(`Bearer ${"b".repeat(48)}`)), false);
    assert.equal(authorizeDiscordBot(request("Bearer a")), false);
    assert.equal(authorizeDiscordBot(request(`Basic ${"a".repeat(48)}`)), false);
  } finally {
    if (previous === undefined) delete process.env.DISCORD_BRIDGE_SECRET;
    else process.env.DISCORD_BRIDGE_SECRET = previous;
  }
});
