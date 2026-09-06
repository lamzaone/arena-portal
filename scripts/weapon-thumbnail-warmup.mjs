import { weaponIdForDefindex } from "@skinhub/viewer";
import models from "../lib/economy/cs2-skin-models.json" with { type: "json" };
import catalogue from "../lib/economy/cs2-finishes.json" with { type: "json" };

function validLimit(limit) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("Limit must be a positive integer");
  return limit;
}

export function parseThumbnailWarmupOptions(args) {
  for (const arg of args) {
    if (!["--inventory", "--catalogue", "--models", "--profile=server", "--profile=warmer"].includes(arg)
      && !/^--limit=\d+$/.test(arg)) throw new Error(`Unknown argument ${arg}`);
  }
  const models = args.includes("--models");
  if (models && (args.includes("--inventory") || args.includes("--catalogue")))
    throw new Error("--models cannot be combined with --inventory or --catalogue");
  return {
    inventory: !models && !args.includes("--catalogue"),
    catalogue: !models && !args.includes("--inventory"),
    models,
    limit: validLimit(Number(args.find(arg => arg.startsWith("--limit="))?.slice(8) ?? Number.MAX_SAFE_INTEGER)),
    profile: args.find(arg => arg.startsWith("--profile="))?.slice(10) ?? "warmer",
  };
}

/** One released finish for each supported definition/mesh, independent of the database. */
export function selectThumbnailModelRepresentatives({ finishes = catalogue.finishes, variants = models.variants, limit = Number.MAX_SAFE_INTEGER } = {}) {
  validLimit(limit);
  const candidates = [];
  for (const [identity, finish] of Object.entries(finishes)) {
    if (!/^\d+:\d+$/.test(identity) || !finish || !["skin", "knife", "glove"].includes(finish.itemType)) continue;
    const [definitionIndex, paintkit] = identity.split(":").map(Number);
    const legacyModel = variants[identity];
    if (!Number.isSafeInteger(definitionIndex) || !weaponIdForDefindex(definitionIndex)
      || !Number.isSafeInteger(paintkit) || paintkit < 0 || paintkit > 100_000 || typeof legacyModel !== "boolean") continue;
    const minimum = finish.minFloat ?? 0, maximum = finish.maxFloat ?? 1;
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum < 0 || maximum > 1 || minimum > maximum) continue;
    candidates.push({ itemType: finish.itemType, definitionIndex, paintkit, legacyModel,
      floatValue: Math.min(maximum, Math.max(minimum, 0.15)), seed: 0, stattrak: false });
  }
  // Prefer an actual paint material over the default finish, then choose a
  // stable lowest paint ID. Never force a generation the released pair lacks.
  candidates.sort((a, b) => a.definitionIndex - b.definitionIndex || Number(a.legacyModel) - Number(b.legacyModel)
    || Number(a.paintkit === 0) - Number(b.paintkit === 0) || a.paintkit - b.paintkit);
  const selected = new Map();
  for (const candidate of candidates) {
    const key = `${candidate.definitionIndex}:${candidate.legacyModel}`;
    if (!selected.has(key)) selected.set(key, candidate);
    if (selected.size >= limit) break;
  }
  return [...selected.values()];
}
