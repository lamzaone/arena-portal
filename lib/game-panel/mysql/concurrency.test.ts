import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import mysql from 'mysql2/promise';
import {MysqlPanelStorage,type PanelMutationContext} from '../storage.ts';
import {deriveEconomyKey} from '../journal.ts';
test('isolated MySQL nonce exclusion and journal identity race',async()=>{
 const raw=process.env.GAME_PANEL_TEST_DATABASE_URL;
 if(!raw)throw new Error('Set GAME_PANEL_TEST_DATABASE_URL to a dedicated loopback panel_test_ database. No production URL is accepted.');
 const url=new URL(raw);
 if(url.protocol!=='mysql:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!/^\/panel_test_[a-z0-9_]+$/.test(url.pathname)||url.search)throw new Error('Use a dedicated loopback panel_test_ database.');
 const pool=mysql.createPool({uri:raw,connectionLimit:4,timezone:'Z'});
 try {
  const ddl=await readFile(new URL('../../../db/035_game_panel_adapter.sql',import.meta.url),'utf8');
  const migrationConnection=await pool.getConnection();
  try {
   await migrationConnection.query('CREATE TABLE IF NOT EXISTS portal_crate_openings (id BIGINT UNSIGNED NOT NULL PRIMARY KEY) ENGINE=InnoDB');
   // Prepared migration statements and their session variables must share one connection.
   for(const statement of ddl.split(';').map(s=>s.trim()).filter(Boolean))await migrationConnection.query(statement);
   for(const statement of ddl.split(';').map(s=>s.trim()).filter(Boolean))await migrationConnection.query(statement);
  }finally{migrationConnection.release();}
  const serverId='test-'+Date.now(),nowMs=Date.now(),actorSteamId='76561198000000001',requestId='12345678901234567890123456789012';
  const a=new MysqlPanelStorage(pool),b=new MysqlPanelStorage(pool);
  const results=await Promise.allSettled([a.claimTransport({serverId,actorSteamId,requestId,mutation:true,nowMs}),b.claimTransport({serverId,actorSteamId,requestId,mutation:true,nowMs})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const [rows]=await pool.query<mysql.RowDataPacket[]>('SELECT request_count FROM portal_game_panel_rate_windows WHERE server_id=?',[serverId]);assert.equal(rows.length,3);assert.ok(rows.every(r=>r.request_count===1));
  const principal={serverId,keyId:'a',actorSteamId,allowedOperations:new Set(['inventory.protect'] as const)},operationId=String(nowMs)+'_12345678901234567890123456789012';
  const context:PanelMutationContext={principal,operationId,operation:'inventory.protect',arguments:{itemIds:['10000000-0000-4000-8000-000000000001'],saleLocked:true},bodyHash:'a'.repeat(64),economyKey:deriveEconomyKey(principal,operationId),nowMs};
  const admission=await Promise.allSettled([a.admitOperation({...context}),b.admitOperation({...context,bodyHash:'b'.repeat(64)})]);assert.equal(admission.filter(r=>r.status==='fulfilled').length,1);assert.equal(admission.filter(r=>r.status==='rejected'&&r.reason.code==='idempotency_conflict').length,1);
 }finally{await pool.end();}
});
