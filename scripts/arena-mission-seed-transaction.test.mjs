import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { seedArenaMissionLibrary } from './seed-arena-missions.mjs';
import { validateMissionPool } from './arena-mission-seed-policy.mjs';

const missions = validateMissionPool(JSON.parse(await readFile(new URL('../lib/missions/arena-mission-pool.json', import.meta.url), 'utf8')));

// Execute actual inserts, reads and rollback in SQLite. Only MySQL metadata,
// named locks and UTC timestamp syntax are adapted; this does not test MySQL concurrency.
function fixture() {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE portal_mission_definitions(period_kind TEXT,mission_id TEXT,disabled_immediately INTEGER DEFAULT 0,disabled_until_period_start TEXT,created_at TEXT,updated_at TEXT,PRIMARY KEY(period_kind,mission_id));
        CREATE TABLE portal_mission_definition_versions(period_kind TEXT,mission_id TEXT,version TEXT,effective_period_start TEXT,enabled INTEGER,definition TEXT,actor_steam_id TEXT,created_at TEXT,PRIMARY KEY(period_kind,mission_id,version));`);
    async function query(sql, parameters = []) {
        if (sql.startsWith('SELECT DATABASE()')) return [[{ database_name: 'disposable_fixture' }]];
        if (sql.startsWith('SELECT GET_LOCK')) return [[{ acquired: 1 }]];
        if (sql.startsWith('SELECT RELEASE_LOCK')) return [[{ released: 1 }]];
        if (sql.includes('information_schema.TABLES')) return [[{ name: 'portal_mission_definitions', engine: 'InnoDB' }, { name: 'portal_mission_definition_versions', engine: 'InnoDB' }]];
        if (sql.startsWith('SHOW CREATE TABLE')) return [[{ 'Create Table': db.prepare('SELECT sql FROM sqlite_master WHERE name=?').get(sql.split(' ').at(-1)).sql }]];
        const normalized = sql.replace(/ FOR UPDATE/g, '').replace(/UTC_TIMESTAMP\(6\)/g, "'2026-10-22 10:00:00'");
        const statement = db.prepare(normalized);
        return [/^SELECT/.test(sql) ? statement.all(...parameters) : statement.run(...parameters)];
    }
    const connection = { query, execute: query, async beginTransaction() { db.exec('BEGIN'); }, async commit() { db.exec('COMMIT'); }, async rollback() { db.exec('ROLLBACK'); } };
    const backups = new Map();
    const writeBackup = async (name, data) => { backups.set(name, JSON.parse(JSON.stringify(data))); };
    const counts = () => ['portal_mission_definitions', 'portal_mission_definition_versions'].map(table => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n);
    const run = (extra = {}) => seedArenaMissionLibrary({ connection, missions, writeBackup, now: new Date('2026-10-22T10:00:00Z'), ...extra });
    return { db, backups, counts, run, writeBackup };
}

test('audit backs up matching rows and plans every schedule without inserting anything', async () => {
    const f = fixture();
    try {
        const result = await f.run();
        assert.deepEqual(result, { mode: 'audit', planned: 100, preserved: 0, inserted: 0, verified: true });
        assert.deepEqual(f.counts(), [0, 0]);
        assert.equal(f.backups.get('before.json').plan.insertions.length, 100);
        assert.equal(f.backups.has('verification.json'), false);
    } finally { f.db.close(); }
});

test('apply preserves staff versions and immediate disables, backs up before writing, and repeats without changing rows', async () => {
    const f = fixture();
    try {
        const existing = missions[0];
        f.db.prepare('INSERT INTO portal_mission_definitions(period_kind,mission_id,disabled_immediately)VALUES(?,?,1)').run(existing.period, existing.id);
        f.db.prepare('INSERT INTO portal_mission_definition_versions(period_kind,mission_id,version,effective_period_start,enabled,definition,actor_steam_id)VALUES(?,?,?,?,?,?,?)')
            .run(existing.period, existing.id, '9', '2027-01-01', 0, '{"title":"Staff edited"}', '76561198000000001');
        const result = await f.run({ apply: true, writeBackup: async (name, data) => {
            if (name === 'before.json') assert.deepEqual(f.counts(), [1, 1]);
            await f.writeBackup(name, data);
        } });
        assert.equal(result.inserted, 99);
        assert.equal(result.preserved, 1);
        assert.deepEqual(f.counts(), [100, 100]);
        const before = f.backups.get('before.json');
        assert.equal(before.definitions[0].disabled_immediately, 1);
        assert.equal(before.versions[0].version, '9');
        assert.equal(f.backups.get('verification.json').versions.length, 100);
        const beforeRepeat = f.db.prepare('SELECT * FROM portal_mission_definition_versions ORDER BY period_kind,mission_id').all();
        assert.equal((await f.run({ apply: true })).inserted, 0);
        assert.deepEqual(f.db.prepare('SELECT * FROM portal_mission_definition_versions ORDER BY period_kind,mission_id').all(), beforeRepeat);
    } finally { f.db.close(); }
});

test('a missing or failed backup prevents every mission write', async () => {
    const f = fixture();
    try {
        await assert.rejects(f.run({ apply: true, writeBackup: undefined }), /backup writer/);
        await assert.rejects(f.run({ apply: true, writeBackup: async () => { throw new Error('disk full'); } }), /disk full/);
        assert.deepEqual(f.counts(), [0, 0]);
        assert.equal((await f.run({ apply: true })).inserted, 100);
    } finally { f.db.close(); }
});

test('a database insertion failure halfway through rolls back all parents and versions', async () => {
    const f = fixture();
    try {
        f.db.exec(`CREATE TRIGGER fail_seed BEFORE INSERT ON portal_mission_definition_versions WHEN NEW.mission_id='${missions[50].id}' BEGIN SELECT RAISE(ABORT,'insertion failed'); END;`);
        await assert.rejects(f.run({ apply: true }), /insertion failed/);
        assert.deepEqual(f.counts(), [0, 0]);
        assert.equal(f.backups.get('before.json').plan.insertions.length, 100);
        assert.equal(f.backups.has('result.json'), false);
    } finally { f.db.close(); }
});

test('failed verification snapshot rolls back all seed writes before commit', async () => {
    const f = fixture();
    try {
        await assert.rejects(f.run({ apply: true, writeBackup: async (name, data) => {
            if (name === 'verification.json') throw new Error('backup unavailable');
            await f.writeBackup(name, data);
        } }), /backup unavailable/);
        assert.deepEqual(f.counts(), [0, 0]);
    } finally { f.db.close(); }
});
