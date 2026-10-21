import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import nextEnv from '@next/env';
import mysql from 'mysql2/promise';
import { buildMissionSeedPlan, parseSeedArguments, validateMissionPool } from './arena-mission-seed-policy.mjs';

const definitionsTable = 'portal_mission_definitions';
const versionsTable = 'portal_mission_definition_versions';
const seedActor = 'system:arena-seed';
const sha = value => createHash('sha256').update(value).digest('hex');

/** Connection boundary is injectable so operators can verify the same transaction on a disposable DB. */
export async function seedArenaMissionLibrary({ connection, missions, apply = false, writeBackup, now = new Date() }) {
    if (typeof writeBackup !== 'function') throw new Error('A durable backup writer is required.');
    missions = validateMissionPool({ missions });
    const [[identity]] = await connection.query('SELECT DATABASE() AS database_name');
    if (!identity.database_name) throw new Error('No portal database is selected.');
    const lockName = 'portal.arena-mission-seed.' + sha(identity.database_name).slice(0, 24);
    const [[lock]] = await connection.query('SELECT GET_LOCK(?, 15) AS acquired', [lockName]);
    if (Number(lock.acquired) !== 1) throw new Error('Another arena mission seed owns the lock.');
    let transaction = false;
    try {
        const [engines] = await connection.query('SELECT TABLE_NAME AS name, ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (?,?)', [definitionsTable, versionsTable]);
        if (engines.length !== 2 || engines.some(row => String(row.engine).toLowerCase() !== 'innodb'))
            throw new Error('Apply migration 046 first; both mission tables must use InnoDB.');
        // Staff writes use the same parent-row locks. A concurrent new ID causes a
        // duplicate-key rollback rather than modifying an existing staff record.
        await connection.beginTransaction();
        transaction = true;
        const placeholders = missions.map(() => '(?,?)').join(',');
        const parameters = missions.flatMap(mission => [mission.period, mission.id]);
        const predicate = ` WHERE (period_kind,mission_id) IN (${placeholders})`;
        const readDefinitions = `SELECT * FROM ${definitionsTable}${predicate} ORDER BY period_kind,mission_id`;
        const readVersions = `SELECT * FROM ${versionsTable}${predicate} ORDER BY period_kind,mission_id,version`;
        const [definitions] = await connection.query(readDefinitions + ' FOR UPDATE', parameters);
        const [versions] = await connection.query(readVersions + ' FOR UPDATE', parameters);
        const plan = buildMissionSeedPlan(missions, definitions, versions, now);
        const ddl = {};
        for (const table of [definitionsTable, versionsTable]) {
            const [rows] = await connection.query('SHOW CREATE TABLE ' + table);
            ddl[table] = rows[0]['Create Table'];
        }
        const before = { schemaVersion: 1, mode: apply ? 'apply' : 'audit', startedAt: now.toISOString(),
            database: identity.database_name, catalogueSha256: sha(JSON.stringify(missions)),
            ddl, definitions, versions, plan };
        // No INSERT runs unless a recoverable snapshot has been durably written.
        await writeBackup('before.json', before, { exclusive: true });
        if (!apply) {
            await connection.rollback();
            transaction = false;
            return { mode: 'audit', planned: plan.insertions.length, preserved: plan.preserved.length, inserted: 0, verified: true };
        }
        for (const row of plan.insertions) {
            await connection.execute(`INSERT INTO ${definitionsTable}(period_kind,mission_id,created_at,updated_at) VALUES(?,?,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))`, [row.period, row.id]);
            await connection.execute(`INSERT INTO ${versionsTable}(period_kind,mission_id,version,effective_period_start,enabled,definition,actor_steam_id,created_at) VALUES(?,?,?,?,?,?,?,UTC_TIMESTAMP(6))`, [row.period, row.id, row.version, row.effectivePeriodStart, row.enabled, row.definition, seedActor]);
        }
        const [afterDefinitions] = await connection.query(readDefinitions, parameters);
        const [afterVersions] = await connection.query(readVersions, parameters);
        const key = row => `${row.period_kind}/${row.mission_id}`;
        const inserted = new Set(plan.insertions.map(row => `${row.period}/${row.id}`));
        if (JSON.stringify(afterDefinitions.filter(row => !inserted.has(key(row)))) !== JSON.stringify(definitions) ||
            JSON.stringify(afterVersions.filter(row => !inserted.has(key(row)))) !== JSON.stringify(versions))
            throw new Error('Existing mission records changed; rolling back the seed.');
        if (afterDefinitions.length !== definitions.length + plan.insertions.length || afterVersions.length !== versions.length + plan.insertions.length)
            throw new Error('Mission seed row counts failed verification.');
        for (const row of plan.insertions) {
            const actual = afterVersions.find(version => key(version) === `${row.period}/${row.id}`);
            if (!actual || String(actual.version) !== '1' || String(actual.effective_period_start).slice(0, 10) !== row.effectivePeriodStart || Number(actual.enabled) !== 1 || actual.definition !== row.definition)
                throw new Error('A seeded mission version failed verification.');
        }
        // Persist the verification snapshot before COMMIT; failures still roll back.
        await writeBackup('verification.json', { verifiedAt: new Date().toISOString(), definitions: afterDefinitions, versions: afterVersions });
        await connection.commit();
        transaction = false;
        const result = { mode: 'apply', planned: plan.insertions.length, preserved: plan.preserved.length, inserted: plan.insertions.length, verified: true };
        // A failure writing result.json does not imply the already committed seed failed.
        try { await writeBackup('result.json', { ...result, committedAt: new Date().toISOString() }); }
        catch { result.resultReportWritten = false; }
        return result;
    } catch (error) {
        if (transaction) { await connection.rollback(); transaction = false; }
        throw error;
    } finally {
        // Closing the owning connection also releases the lock after a lost connection.
        try { await connection.query('SELECT RELEASE_LOCK(?)', [lockName]); } catch {}
    }
}

async function main() {
    const options = parseSeedArguments(process.argv.slice(2));
    if (options.help) {
        console.log('Usage: node --experimental-transform-types scripts/seed-arena-missions.mjs [--audit | --apply]\nDefaults to audit. Loads PORTAL_DATABASE_URL via @next/env. Apply inserts only absent IDs as current-period version 1; all existing staff records are preserved. Backups: ../backups/arena-mission-pool-*/');
        return;
    }
    const portalRoot = fileURLToPath(new URL('../', import.meta.url));
    nextEnv.loadEnvConfig(portalRoot, false, { info() {}, error() {} });
    if (!process.env.PORTAL_DATABASE_URL) throw new Error('PORTAL_DATABASE_URL is not configured.');
    const missions = validateMissionPool(JSON.parse(await readFile(new URL('../lib/missions/arena-mission-pool.json', import.meta.url), 'utf8')));
    const connection = await mysql.createConnection({ uri: process.env.PORTAL_DATABASE_URL, connectTimeout: 20000,
        timezone: 'Z', dateStrings: true, supportBigNumbers: true, bigNumberStrings: true, multipleStatements: false });
    let backupDirectory;
    try {
        await connection.query("SET SESSION time_zone = '+00:00'");
        const [[clock]] = await connection.query("SELECT DATE_FORMAT(UTC_TIMESTAMP(6),'%Y-%m-%dT%H:%i:%s.%fZ') AS seed_now");
        const now = new Date(clock.seed_now);
        backupDirectory = resolve(portalRoot, '../backups', 'arena-mission-pool-' + now.toISOString().replaceAll(/[:.]/g, '-') + '-' + randomUUID());
        await mkdir(backupDirectory, { recursive: true });
        const writeBackup = (name, data, { exclusive = false } = {}) => writeFile(resolve(backupDirectory, name), JSON.stringify(data, null, 2) + '\n', { flag: exclusive ? 'wx' : 'w' });
        const result = await seedArenaMissionLibrary({ connection, missions, apply: options.apply, writeBackup, now });
        console.log(JSON.stringify({ ...result, backup: backupDirectory }, null, 2));
    } finally { await connection.end(); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
    main().catch(error => {
        // Never print driver SQL or connection URLs, which may contain credentials.
        console.error('Arena mission seed failed:', error.code ?? (error.message.startsWith('Use --') ? error.message : 'Review the database prerequisites and local backup directory.'));
        process.exitCode = 1;
    });
