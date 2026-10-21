import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, test } from 'node:test';
registerHooks({ resolve(s, c, next) { if (s === 'server-only')
        return { url: 'data:text/javascript,', shortCircuit: true }; return next(s, c); } });
const { createMissionManagementRepository } = await import('./mission-management.ts');
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE portal_mission_definitions(period_kind TEXT,mission_id TEXT,disabled_immediately INTEGER DEFAULT 0,disabled_until_period_start TEXT,created_at TEXT,updated_at TEXT,PRIMARY KEY(period_kind,mission_id));
CREATE TABLE portal_mission_definition_versions(period_kind TEXT,mission_id TEXT,version TEXT,effective_period_start TEXT,enabled INTEGER,definition TEXT,created_at TEXT,actor_steam_id TEXT,PRIMARY KEY(period_kind,mission_id,version));
CREATE TABLE portal_staff_config_operations(actor_steam_id TEXT,idempotency_key TEXT,request_hash TEXT,result_json TEXT,PRIMARY KEY(actor_steam_id,idempotency_key));
CREATE TABLE portal_hud_effect_settings(id INTEGER PRIMARY KEY,version TEXT,config_json TEXT,updated_by TEXT,updated_at TEXT);
CREATE TABLE portal_audit_events(actor_type TEXT,actor_id TEXT,action TEXT,target_type TEXT,target_id TEXT,metadata TEXT);`);
db.exec(`CREATE TABLE portal_economy_catalogue(id INTEGER PRIMARY KEY,catalogue_key TEXT,enabled INTEGER,item_type TEXT,rarity_rank INTEGER,metadata TEXT,definition_index INTEGER,paintkit INTEGER);
CREATE TABLE portal_economy_catalogue_prices(catalogue_id INTEGER,is_current INTEGER,price_source TEXT,source_reference TEXT,market_price_eur_cents INTEGER);
CREATE TABLE portal_loot_tables(id INTEGER PRIMARY KEY,container_catalogue_id INTEGER,enabled INTEGER);
CREATE TABLE portal_loot_entries(loot_table_id INTEGER,catalogue_id INTEGER,enabled INTEGER,weight INTEGER);`);
let failAudit = false;
async function query(sql: string, args: unknown[] = []) {
    if (failAudit && sql.includes('INSERT INTO portal_audit_events'))
        throw new Error('audit unavailable');
    const normalized = sql.replace(/ FOR UPDATE/g, '').replace(/INSERT IGNORE INTO/g, 'INSERT OR IGNORE INTO').replace(/UTC_TIMESTAMP\(6\)/g, "'2026-10-21 10:00:00'");
    const statement = db.prepare(normalized);
    if (/^\s*SELECT/i.test(sql))
        return [statement.all(...args as never[])];
    const result = statement.run(...args as never[]);
    return [{ affectedRows: Number(result.changes), insertId: Number(result.lastInsertRowid) }];
}
const connection = { query, execute: query, async beginTransaction() { db.exec('BEGIN'); }, async commit() { db.exec('COMMIT'); }, async rollback() { db.exec('ROLLBACK'); }, release() { } };
const repository = createMissionManagementRepository({ query, getConnection: async () => connection } as never, () => new Date('2026-10-21T10:00:00Z'));
const definition = { period: 'daily', id: 'precision', title: 'Precision', metric: 'headshots', target: 10, tokens: '18446744073709551615', enabled: true, rewards: [] };
const actorSteamId = '76561198000000001';
const save = (key = 'operation-key-0001', expectedVersion = '0', extra = {}) => repository.publish({ actorSteamId, idempotencyKey: key, expectedVersion, definition: { ...definition, ...extra } });
beforeEach(() => { failAudit = false; db.exec('DELETE FROM portal_mission_definitions; DELETE FROM portal_mission_definition_versions; DELETE FROM portal_staff_config_operations; DELETE FROM portal_audit_events; DELETE FROM portal_hud_effect_settings; DELETE FROM portal_economy_catalogue; DELETE FROM portal_loot_tables; DELETE FROM portal_loot_entries;'); });
test('publication creates a next-period version, atomically audited, and identical retry replays', async () => {
    const result = await save();
    assert.equal(result.effectivePeriodStart, '2026-10-22');
    assert.equal(result.version, '1');
    assert.deepEqual(await save(), result);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM portal_audit_events').get()?.n, 1);
    await assert.rejects(save('operation-key-0002'), /changed/i);
    await assert.rejects(save('operation-key-0001', '0', { target: 11 }), /reused/i);
});
test('audit failure rolls back definition, operation and version together', async () => {
    failAudit = true;
    await assert.rejects(save(), /audit unavailable/);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM portal_mission_definitions').get()?.n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM portal_staff_config_operations').get()?.n, 0);
});
test('immediate disable followed by scheduled enable stays disabled until boundary', async () => {
    await save();
    const input = { actorSteamId, idempotencyKey: 'operation-key-disable', period: 'daily' as const, id: 'precision', expectedVersion: '1' };
    const disabled = await repository.disable(input);
    assert.equal(disabled.version, '2');
    assert.deepEqual(await repository.disable(input), disabled);
    await assert.rejects(save('operation-key-stale', '1'), /changed/i);
    const versions = db.prepare('SELECT version,effective_period_start,enabled,definition FROM portal_mission_definition_versions ORDER BY version').all();
    assert.equal(versions.length, 2);
    assert.deepEqual({ ...versions[0], version: '2' }, { ...versions[1] });
    await save('operation-key-0003', '2');
    const row = db.prepare('SELECT * FROM portal_mission_definitions').get();
    assert.equal(row?.disabled_immediately, 1);
    assert.equal(row?.disabled_until_period_start, '2026-10-22');
});
test('effects only increment version when changed and reject stale updates', async () => {
    const config = { styleId: 'pulse', palette: 'gold', speed: 1, intensity: .5, reducedMotion: 'always' };
    db.prepare('INSERT INTO portal_hud_effect_settings(id,version,config_json)VALUES(1,?,?)').run('0', JSON.stringify(config));
    const input = { actorSteamId, idempotencyKey: 'effects-operation-01', expectedVersion: '0', config };
    assert.equal((await repository.saveEffects(input)).version, '0');
    assert.equal((await repository.saveEffects({ ...input, idempotencyKey: 'effects-operation-02', config: { ...config, palette: 'rose' } })).version, '1');
    await assert.rejects(repository.saveEffects({ ...input, idempotencyKey: 'effects-operation-03' }), /changed/i);
});
test('publication rejects missing products, invalid custom membership and empty containers without publishing partial rows', async () => {
    await assert.rejects(save('product-missing-0001', '0', { rewards: [{ catalogueKey: 'missing', quantity: 1 }] }), /unavailable/i);
    db.exec(`INSERT INTO portal_economy_catalogue(id,catalogue_key,enabled,item_type,rarity_rank,metadata)VALUES(1,'vip',1,'vip_membership',8,'{}'),(2,'case',1,'crate',4,'{}')`);
    await assert.rejects(save('product-invalid-0001', '0', { rewards: [{ catalogueKey: 'vip', quantity: 1 }] }), /supported/i);
    await assert.rejects(save('product-empty-0001', '0', { rewards: [{ catalogueKey: 'case', quantity: 1 }] }), /loot/i);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM portal_mission_definition_versions').get()?.n, 0);
});
