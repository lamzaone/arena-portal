import assert from 'node:assert/strict';
import test from 'node:test';
import { MysqlPanelStorage } from './storage.ts';
test('transport storage rolls back a duplicate nonce without committing counters',async()=>{
  const calls:string[]=[];
  const connection={beginTransaction:async()=>{calls.push('begin');},commit:async()=>{calls.push('commit');},rollback:async()=>{calls.push('rollback');},release:()=>{},execute:async(sql:string)=>{calls.push(sql);if(sql.includes('INSERT INTO portal_game_panel_nonces'))throw Object.assign(Error(),{code:'ER_DUP_ENTRY'});if(sql.startsWith('SELECT'))return [[{request_count:1}],[]];return [{affectedRows:1},[]];}};
  const storage=new MysqlPanelStorage({getConnection:async()=>connection} as never);
  await assert.rejects(storage.claimTransport({serverId:'arena-test',actorSteamId:'76561198000000001',requestId:'0'.repeat(32),mutation:true,nowMs:1790164800000}),{code:'request_replayed'});
  assert.ok(calls.includes('rollback'));assert.ok(!calls.includes('commit'));
});
test('durable server and actor caps reject before nonce admission',async()=>{
 for(const count of [601,61,13]){
  let selected=0,nonces=0,rolledBack=false;
  const connection={beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{rolledBack=true;},release:()=>{},execute:async(sql:string)=>{if(sql.startsWith('SELECT')){selected++;return [[{request_count:selected===(count===601?1:count===61?2:3)?count:1}],[]];}if(sql.includes('INSERT INTO portal_game_panel_nonces'))nonces++;return [{affectedRows:1},[]];}};
  const storage=new MysqlPanelStorage({getConnection:async()=>connection} as never);
  await assert.rejects(storage.claimTransport({serverId:'arena-test',actorSteamId:'76561198000000001',requestId:'0'.repeat(32),mutation:true,nowMs:1790164800000}),{code:'rate_limited'});assert.equal(nonces,0);assert.equal(rolledBack,true);
 }
});
