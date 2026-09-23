import assert from 'node:assert/strict';
import test from 'node:test';
import { createPanelJournal, deriveEconomyKey } from './journal.ts';
import type { PanelMutationContext, PanelOperationRecord, PanelStorage } from './storage.ts';
const now=1790164800000;
function harness(){
 let row:PanelOperationRecord|null=null,receipt:unknown=null,effects=0,loseCompletion=true;
 const context:PanelMutationContext={principal:{serverId:'arena-test',keyId:'a',actorSteamId:'76561198000000001',allowedOperations:new Set(['market.purchase','operations.status'])},operation:'market.purchase',arguments:{catalogueId:1,quantity:1,stattrak:false,expectedUnitPriceTokens:'10'},operationId:`${now}_00112233445566778899aabbccddeeff`,bodyHash:'a'.repeat(64),economyKey:'',nowMs:now};context.economyKey=deriveEconomyKey(context.principal,context.operationId);
 const storage:PanelStorage={claimTransport:async()=>{},readOperation:async(server,actor,id)=>row?.serverId===server&&row.actorSteamId===actor&&row.operationId===id?row:null,admitOperation:async c=>row??=( {serverId:c.principal.serverId,actorSteamId:c.principal.actorSteamId,operationId:c.operationId,operation:c.operation,bodyHash:c.bodyHash,economyKey:c.economyKey,state:'pending',result:null,error:null,expiresAt:now+7*86400000,leaseToken:null,leaseUntil:null}),claimOperationLease:async c=>{c.leaseToken='test';return row!;},completeOperation:async(_c,result)=>{if(loseCompletion){throw Error('connection lost');}row!.state='completed';row!.result=result;},recordOperationError:async()=>{}};
 const journal=createPanelJournal({storage,now:()=>context.nowMs,receipt:async()=>receipt?{status:'completed',result:receipt}:null,restore:async(_c,result)=>result});
 const work=async()=>{effects++;receipt={itemIds:['10000000-0000-4000-8000-000000000001']};return receipt;};
 return {context,journal,work,effects:()=>effects,reconnect:()=>{loseCompletion=false;}};
}
test('commit response loss restores durable receipt without executing work twice',async()=>{const h=harness();await assert.rejects(h.journal.execute(h.context,h.work),{code:'operation_uncertain'});h.reconnect();assert.deepEqual(await h.journal.execute(h.context,h.work),{itemIds:['10000000-0000-4000-8000-000000000001']});assert.equal(h.effects(),1);await assert.rejects(h.journal.execute({...h.context,bodyHash:'b'.repeat(64)},h.work),{code:'idempotency_conflict'});});
test('old operation cannot execute after retention, and cross-actor status is hidden',async()=>{const h=harness();h.context.nowMs+=8*86400000;await assert.rejects(h.journal.execute(h.context,h.work),{code:'operation_expired'});assert.equal(h.effects(),0);const status=await h.journal.status({...h.context.principal,actorSteamId:'76561198000000002'},h.context.operationId);assert.equal(status.status,'expired');});
test('completed results remain readable after execution deadline while expired rows cannot execute',async()=>{
 const h=harness();h.reconnect();const first=await h.journal.execute(h.context,h.work);h.context.nowMs+=2*86400000;
 assert.deepEqual(await h.journal.execute(h.context,h.work),first);assert.equal(h.effects(),1);
 assert.equal((await h.journal.status({...h.context.principal,actorSteamId:'76561198000000002'},h.context.operationId)).status,'expired');
 await assert.rejects(h.journal.status({...h.context.principal,allowedOperations:new Set(['operations.status'])},h.context.operationId),{status:403});
 h.context.nowMs+=6*86400000;await assert.rejects(h.journal.execute(h.context,h.work),{code:'operation_expired'});assert.equal(h.effects(),1);
});
test('a recent missing status remains pending without admitting or executing a command',async()=>{const h=harness();const status=await h.journal.status(h.context.principal,h.context.operationId);assert.equal(status.status,'pending');assert.equal(h.effects(),0);});
