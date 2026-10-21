import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import nextEnv from '@next/env';
import mysql from 'mysql2/promise';

nextEnv.loadEnvConfig(fileURLToPath(new URL('../', import.meta.url)), false, { info() {}, error() {} });
const apply = process.argv.includes('--apply');
const migrations = ['046_mission_definitions.sql', '047_hud_effect_settings.sql', '048_persistent_reports.sql'];
const expected = {
  portal_mission_definitions: ['period_kind','mission_id','disabled_immediately','disabled_until_period_start','created_at','updated_at'],
  portal_mission_definition_versions: ['period_kind','mission_id','version','effective_period_start','enabled','definition','actor_steam_id','created_at'],
  portal_hud_effect_settings: ['id','version','config_json','updated_by','updated_at'],
  portal_staff_config_operations: ['actor_steam_id','idempotency_key','request_hash','result_json','created_at'],
  arena_player_reports: ['id','server_scope','version','report_type','reporter_steam_id','reporter_name','target_steam_id','target_name','reason','status','created_at','resolution_actor_steam_id','resolution_actor_name','resolution_note','resolved_at'],
};
const prerequisite = ['portal_economy_catalogue', 'portal_audit_events', 'portal_discord_notifications'];
const sha = value => createHash('sha256').update(value).digest('hex');
const quote = value => '`' + value.replaceAll('`','``') + '`';
let connection, locked = false, outputPath, report;
try {
  if (!process.env.PORTAL_DATABASE_URL) throw new Error('PORTAL_DATABASE_URL is not configured.');
  connection = await mysql.createConnection({ uri: process.env.PORTAL_DATABASE_URL, connectTimeout: 20000,
    timezone: 'Z', dateStrings: true, supportBigNumbers: true, bigNumberStrings: true, multipleStatements: false });
  await connection.query("SET time_zone = '+00:00'");
  const [[identity]] = await connection.query('SELECT DATABASE() AS database_name, @@hostname AS server_host, VERSION() AS database_version');
  if (!identity.database_name) throw new Error('No portal database selected.');
  const lockName = 'tapped-hud-migrations-' + sha(identity.database_name).slice(0,24);
  const [[lock]] = await connection.query('SELECT GET_LOCK(?, 15) AS acquired', [lockName]);
  if (Number(lock.acquired) !== 1) throw new Error('Another migration runner owns the lock.');
  locked = lockName;
  const [existing] = await connection.query('SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()');
  const tables = new Set(existing.map(row => row.name));
  const missingPrerequisites = prerequisite.filter(name => !tables.has(name));
  if (missingPrerequisites.length) throw new Error('Missing prerequisite tables: ' + missingPrerequisites.join(', '));
  const sql = await Promise.all(migrations.map(async name => {
    const source = await readFile(new URL('../db/' + name, import.meta.url),'utf8');
    const statements = source.replace(/^\s*--[^\n]*$/gm,'').split(';').map(s => s.trim()).filter(Boolean);
    if (statements.some(s => !/^(CREATE TABLE IF NOT EXISTS\s|INSERT IGNORE INTO portal_hud_effect_settings\s)/i.test(s)))
      throw new Error('Migration contains an unexpected statement: ' + name);
    return {name, sha256:sha(source), statements};
  }));
  const before = {};
  for (const table of Object.keys(expected)) {
    if (!tables.has(table)) { before[table] = { exists:false }; continue; }
    const [ddl] = await connection.query('SHOW CREATE TABLE ' + quote(table));
    const [[count]] = await connection.query('SELECT COUNT(*) AS count FROM ' + quote(table));
    before[table] = {exists:true, rows:String(count.count), ddl:ddl[0]['Create Table']};
    // These migrations never update existing data. Save the only seeded row too.
    if (table === 'portal_hud_effect_settings') {
      const [rows] = await connection.query('SELECT * FROM portal_hud_effect_settings ORDER BY id');
      before[table].data = rows;
    }
  }
  outputPath = resolve(fileURLToPath(new URL('../../backups/', import.meta.url)),
    'hud-migrations-' + new Date().toISOString().replaceAll(/[:.]/g,'-'));
  await mkdir(outputPath, {recursive:true});
  report = {mode:apply?'apply':'audit', identity, startedAt:new Date().toISOString(), migrations:sql.map(({name,sha256,statements})=>({name,sha256,statements:statements.length})), before, executed:[], verified:false};
  await writeFile(resolve(outputPath,'before.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  if (apply) {
    for (const migration of sql) {
      for (const statement of migration.statements) await connection.query(statement);
      report.executed.push(migration.name);
      await writeFile(resolve(outputPath,'result.json'),JSON.stringify(report,null,2)+'\n');
    }
    const after = {};
    for (const [table, columns] of Object.entries(expected)) {
      const [actual] = await connection.query('SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',[table]);
      const names = new Set(actual.map(row=>row.name));
      if (columns.some(name=>!names.has(name))) throw new Error('Schema verification failed: ' + table);
      const [ddl] = await connection.query('SHOW CREATE TABLE ' + quote(table));
      const [[count]] = await connection.query('SELECT COUNT(*) AS count FROM ' + quote(table));
      after[table] = {rows:String(count.count),ddl:ddl[0]['Create Table']};
      if (before[table].exists && table !== 'portal_hud_effect_settings' && String(count.count) !== before[table].rows)
        after[table].concurrentRowChange = true;
    }
    const [settings] = await connection.query('SELECT * FROM portal_hud_effect_settings WHERE id=1');
    if (settings.length !== 1) throw new Error('HUD effects default row was not created.');
    JSON.parse(settings[0].config_json);
    const seededBefore = before.portal_hud_effect_settings.data?.find(row=>Number(row.id)===1);
    if (seededBefore && JSON.stringify(seededBefore) !== JSON.stringify(settings[0])) throw new Error('An existing HUD effects row changed unexpectedly.');
    report.after = after;
    report.verified = true;
    report.completedAt = new Date().toISOString();
    await writeFile(resolve(outputPath,'result.json'),JSON.stringify(report,null,2)+'\n');
  }
  console.log(JSON.stringify({mode:report.mode,database:identity.database_name,host:identity.server_host,
    migrations:report.migrations, existingTables:Object.fromEntries(Object.entries(before).map(([k,v])=>[k,v.exists])),
    executed:report.executed, verified:report.verified,backup:outputPath},null,2));
} catch (error) {
  if (outputPath && report) await writeFile(resolve(outputPath,'failure.json'),JSON.stringify({...report,error:{code:error.code??null,message:error.sqlMessage??error.message}},null,2)+'\n');
  // Never print connection URLs or credentials.
  console.error('Migration failed:',error.code??error.message);
  process.exitCode = 1;
} finally {
  if (connection) {
    if (locked) try { await connection.query('SELECT RELEASE_LOCK(?)',[locked]); } catch {}
    await connection.end();
  }
}
