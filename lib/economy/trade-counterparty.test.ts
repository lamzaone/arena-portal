import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) {
      return {
        url: pathToFileURL(resolve(specifier.slice(2) + ".ts")).href,
        shortCircuit: true,
      };
    }
    return next(specifier, context);
  },
});

const { economyTrades } = await import("../../components/economy/economy-view-model.ts");

const senderSteamId = "76561198000000001";
const recipientSteamId = "76561198000000002";
const repositoryTrade = {
  id: "trade-identity",
  creatorSteamId: senderSteamId,
  counterpartySteamId: recipientSteamId,
  offered: { steamId: senderSteamId, tokens: 250, items: [] },
  requested: { steamId: recipientSteamId, tokens: 100, items: [] },
};

test("incoming trade identity is the sender when the viewer is the recipient", () => {
  const [trade] = economyTrades([{ ...repositoryTrade, direction: "incoming" }]);

  assert.equal(trade.counterpartySteamId, senderSteamId);
  assert.notEqual(trade.counterpartySteamId, recipientSteamId);
  assert.equal(trade.direction, "incoming");
  assert.equal(trade.offeredTokens, 250);
  assert.equal(trade.requestedTokens, 100);
});

test("outgoing trade identity remains the recipient", () => {
  const [trade] = economyTrades([{ ...repositoryTrade, direction: "outgoing" }]);

  assert.equal(trade.counterpartySteamId, recipientSteamId);
  assert.equal(trade.direction, "outgoing");
});

test("trade identity reads the appropriate participant from nested trade sides", () => {
  const { creatorSteamId: _creator, counterpartySteamId: _recipient, ...nestedTrade } = repositoryTrade;
  const [incoming, outgoing] = economyTrades([
    { ...nestedTrade, direction: "incoming" },
    { ...nestedTrade, direction: "outgoing" },
  ]);

  assert.equal(incoming.counterpartySteamId, senderSteamId);
  assert.equal(outgoing.counterpartySteamId, recipientSteamId);
});

test("legacy normalized trades retain their explicit other player identity", () => {
  const [incoming, outgoing, legacy] = economyTrades([
    { id: "incoming", direction: "incoming", counterpartySteamId: senderSteamId },
    { id: "outgoing", direction: "outgoing", counterpartySteamId: recipientSteamId },
    { id: "legacy", tradeDirection: "incoming", otherSteamId: senderSteamId },
  ]);

  assert.equal(incoming.counterpartySteamId, senderSteamId);
  assert.equal(outgoing.counterpartySteamId, recipientSteamId);
  assert.equal(legacy.counterpartySteamId, senderSteamId);
});

test("missing identity stays unknown instead of assuming an outgoing sender is the other player", () => {
  const [trade] = economyTrades([{
    id: "missing-recipient",
    direction: "outgoing",
    creatorSteamId: senderSteamId,
    offered: { steamId: senderSteamId },
  }]);

  assert.equal(trade.counterpartySteamId, "Unknown player");
});
