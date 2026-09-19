import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { extname, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import mysql from "mysql2/promise";

const url = process.env.TAPPED_REDEEM_TEST_DB;
const options = { skip: !url };
const database = `redeem_management_test_${randomUUID().replaceAll("-", "")}`;
let admin, pool;
function moduleUrl(path) {
  const file = (extname(path) ? [path] : [`${path}.ts`, `${path}.tsx`, resolve(path, "index.ts")]).find(existsSync);
  return file ? pathToFileURL(file).href : null;
}
registerHooks({ resolve(specifier, context, next) {
  const stubs = {
    "server-only": "export {};",
    "@/lib/data/database-pools": "export function getGameDatabasePool(){return null} export function getPortalDatabasePool(){return globalThis.__redeemManagementPool}",
    "@/lib/data/identity-catalogue": "export async function ensureIdentityCatalogue(){} export async function getIdentityCatalogueStatus(){} export async function syncIdentityCatalogue(){}",
    "@/lib/data/staff-vip-memberships": "export class StaffVipMembershipError extends Error {}",
    "@/lib/data/vip-membership-activation-saga": "export async function activateVipMembershipItemWithSaga(){}",
  };
  if (stubs[specifier]) return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
  if (specifier === "next/server") return { url: pathToFileURL(resolve("node_modules/next/server.js")).href, shortCircuit: true };
  const resolved = specifier.startsWith("@/") ? moduleUrl(resolve(specifier.slice(2)))
    : specifier.startsWith(".") && context.parentURL?.startsWith("file:") ? moduleUrl(fileURLToPath(new URL(specifier, context.parentURL))) : null;
  return resolved ? { url: resolved, shortCircuit: true } : next(specifier, context);
} });
const repository = await import("./portal-repository.ts");
const actorSteamId = "76561198000000001";
const key = () => randomUUID();
before(async () => {
  if (!url) return;
  const connection = new URL(url);
  admin = await mysql.createConnection({ host: connection.hostname, port: Number(connection.port || 3306), user: decodeURIComponent(connection.username), password: decodeURIComponent(connection.password), multipleStatements: true });
  await admin.query(`CREATE DATABASE \`${database}\``);
  pool = mysql.createPool({ host: connection.hostname, port: Number(connection.port || 3306), user: decodeURIComponent(connection.username), password: decodeURIComponent(connection.password), database, multipleStatements: true, timezone: "Z", connectionLimit: 8 });
  globalThis.__redeemManagementPool = pool;
  await pool.query(readFileSync("db/001_portal.sql", "utf8"));
  await pool.query(readFileSync("db/006_token_economy.sql", "utf8"));
});
after(async () => {
  await pool?.end();
  if (admin && /^redeem_management_test_[a-f0-9]{32}$/.test(database)) await admin.query(`DROP DATABASE \`${database}\``);
  await admin?.end();
});
async function campaign(maxRedemptions = 1) {
  const code = `TEST-${randomUUID()}`;
  const saved = await repository.createEconomyRedeemCode({ actorSteamId, code, displayName: "Restart test", tokenAmount: 100, maxRedemptions, rewards: [], idempotencyKey: key() });
  return { code, id: saved.code.id };
}
function claim(code, steamId = actorSteamId) {
  return repository.redeemEconomyCode({ steamId, code, redeemedVia: "website", idempotencyKey: key() });
}
const manage = (codeId) => ({ actorSteamId, codeId, idempotencyKey: key() });

test("restart resets limits and permits the same player to claim again while preserving claims and rewards", options, async () => {
  const code = await campaign();
  await claim(code.code);
  const restarted = await repository.restartEconomyRedeemCode(manage(code.id));
  assert.notEqual(restarted.codeId, code.id);
  const visible = (await repository.getEconomyRedeemCodes()).codes;
  assert.equal(visible.some(row => row.id === code.id), false);
  assert.equal(visible.find(row => row.id === restarted.codeId).redemptionCount, 0);
  const second = await claim(code.code);
  assert.equal(second.codeId, restarted.codeId);
  await assert.rejects(claim(code.code), /usage limit|already/i);
  const [[totals]] = await pool.query("SELECT COUNT(*) AS claims, SUM(token_amount) AS tokens FROM portal_redeem_code_redemptions WHERE redeem_code_id IN (?,?)", [code.id, restarted.codeId]);
  assert.equal(totals.claims, 2); assert.equal(Number(totals.tokens), 200);
  const [[old]] = await pool.query("SELECT enabled, removed_at, redemption_count FROM portal_redeem_codes WHERE id=?", [code.id]);
  assert.equal(old.enabled, 0); assert.ok(old.removed_at); assert.equal(old.redemption_count, 1);
});

test("restart is idempotent, makes paused code live, and copies item rewards and global limit", options, async () => {
  const code = await campaign(9);
  const [item] = await pool.execute("INSERT INTO portal_economy_catalogue (catalogue_key,item_type,display_name,metadata) VALUES (?, 'sticker', 'Long reward name', '{}')", [key()]);
  await pool.execute("INSERT INTO portal_redeem_code_items (redeem_code_id,catalogue_id,quantity,sort_order) VALUES (?,?,7,2)", [code.id, item.insertId]);
  await repository.setEconomyRedeemCodeEnabled({ ...manage(code.id), enabled: false });
  const request = manage(code.id);
  const first = await repository.restartEconomyRedeemCode(request);
  assert.deepEqual(await repository.restartEconomyRedeemCode(request), first);
  const current = (await repository.getEconomyRedeemCodes()).codes.find(row => row.id === first.codeId);
  assert.equal(current.enabled, true); assert.equal(current.maxRedemptions, 9);
  assert.equal(current.rewards[0].quantity, 7);
  await assert.rejects(repository.restartEconomyRedeemCode(manage(code.id)), /no longer|not exist|removed/i);
});

test("remove hides and invalidates a code, retains previous awards, and allows recreating its text", options, async () => {
  const code = await campaign(null);
  await claim(code.code);
  const request = manage(code.id);
  const first = await repository.removeEconomyRedeemCode(request);
  assert.deepEqual(await repository.removeEconomyRedeemCode(request), first);
  assert.equal((await repository.getEconomyRedeemCodes()).codes.some(row => row.id === code.id), false);
  await assert.rejects(claim(code.code), /not valid|disabled/i);
  await assert.rejects(repository.setEconomyRedeemCodeEnabled({ ...manage(code.id), enabled: true }), /not exist|removed/i);
  const [[oldClaims]] = await pool.query("SELECT COUNT(*) AS total FROM portal_redeem_code_redemptions WHERE redeem_code_id=?", [code.id]);
  assert.equal(oldClaims.total, 1);
  const recreated = await repository.createEconomyRedeemCode({ actorSteamId, code: code.code, displayName: "Reused code", tokenAmount: 100, maxRedemptions: null, rewards: [], idempotencyKey: key() });
  assert.notEqual(recreated.code.id, code.id);
  assert.equal((await claim(code.code)).codeId, recreated.code.id);
});

test("concurrent restarts create one fresh cycle", options, async () => {
  const code = await campaign();
  const results = await Promise.allSettled([repository.restartEconomyRedeemCode(manage(code.id)), repository.restartEconomyRedeemCode(manage(code.id))]);
  assert.equal(results.filter(row => row.status === "fulfilled").length, 1);
  const current = results.find(row => row.status === "fulfilled").value;
  const claims = await Promise.allSettled([claim(code.code), claim(code.code)]);
  assert.equal(claims.filter(row => row.status === "fulfilled").length, 1);
  assert.equal(claims.find(row => row.status === "fulfilled").value.codeId, current.codeId);
});

test("audit failure rolls back removal, including its code hash and enabled state", options, async () => {
  const code = await campaign();
  await pool.query("CREATE TRIGGER reject_redeem_remove BEFORE INSERT ON portal_economy_admin_audit FOR EACH ROW BEGIN IF NEW.action='redeem_code.removed' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='audit unavailable'; END IF; END");
  try {
    await assert.rejects(repository.removeEconomyRedeemCode(manage(code.id)), /audit unavailable/);
    assert.equal((await claim(code.code)).codeId, code.id);
  } finally { await pool.query("DROP TRIGGER reject_redeem_remove"); }
});
