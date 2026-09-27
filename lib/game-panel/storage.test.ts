import assert from 'node:assert/strict';
import test from 'node:test';
import { MysqlPanelStorage } from './storage.ts';
test('transport storage rolls back a duplicate nonce without committing counters',async()=>{
  const calls:string[]=[];
  const connection={beginTransaction:async()=>{calls.push('begin');},commit:async()=>{calls.push('commit');},rollback:async()=>{calls.push('rollback');},release:()=>{},execute:async(sql:string)=>{calls.push(sql);if(sql.includes('INSERT INTO portal_game_panel_nonces'))throw Object.assign(Error(),{code:'ER_DUP_ENTRY'});if(sql.startsWith('SELECT'))return [[{subject:'all',request_count:1},{subject:'r:76561198000000001',request_count:1},{subject:'m:76561198000000001',request_count:1}],[]];return [{affectedRows:1},[]];}};
  const storage=new MysqlPanelStorage({getConnection:async()=>connection} as never);
  await assert.rejects(storage.claimTransport({serverId:'arena-test',actorSteamId:'76561198000000001',requestId:'0'.repeat(32),mutation:true,nowMs:1790164800000}),{code:'request_replayed'});
  assert.ok(calls.includes('rollback'));assert.ok(!calls.includes('commit'));
});
test('transport batches rate caps into one upsert and one locking read',async()=>{
  const calls:string[]=[];
  const actor='76561198000000001';
  const connection={beginTransaction:async()=>{},commit:async()=>{calls.push('commit');},rollback:async()=>{},release:()=>{},execute:async(sql:string)=>{calls.push(sql);if(sql.startsWith('SELECT'))return [[{subject:'all',request_count:1},{subject:`r:${actor}`,request_count:1}],[]];return [{affectedRows:1},[]];}};
  const storage=new MysqlPanelStorage({getConnection:async()=>connection} as never);
  await storage.claimTransport({serverId:'arena-test',actorSteamId:actor,requestId:'0'.repeat(32),mutation:false,nowMs:1790164800000});
  assert.equal(calls.filter(sql=>sql.startsWith('INSERT INTO portal_game_panel_rate_windows')).length,1);
  assert.equal(calls.filter(sql=>sql.startsWith('SELECT')&&sql.includes('FOR UPDATE')).length,1);
  assert.equal(calls.filter(sql=>sql.includes('INSERT INTO portal_game_panel_nonces')).length,1);
  assert.ok(calls.includes('commit'));
});
test('durable server and actor caps reject before nonce admission',async()=>{
 for(const [subject,count] of [['all',601],['r:76561198000000001',61],['m:76561198000000001',13]] as const){
  let nonces=0,rolledBack=false;
  const connection={beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{rolledBack=true;},release:()=>{},execute:async(sql:string)=>{if(sql.startsWith('SELECT'))return [[...['all','r:76561198000000001','m:76561198000000001'].map(value=>({subject:value,request_count:value===subject?count:1}))],[]];if(sql.includes('INSERT INTO portal_game_panel_nonces'))nonces++;return [{affectedRows:1},[]];}};
  const storage=new MysqlPanelStorage({getConnection:async()=>connection} as never);
  await assert.rejects(storage.claimTransport({serverId:'arena-test',actorSteamId:'76561198000000001',requestId:'0'.repeat(32),mutation:true,nowMs:1790164800000}),{code:'rate_limited'});assert.equal(nonces,0);assert.equal(rolledBack,true);
 }
});
