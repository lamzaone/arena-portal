import assert from 'node:assert/strict';
import test from 'node:test';
import {createPanelHandler} from './handler.ts';
import {signedRequest,syntheticConfiguration} from './fixtures/auth.ts';
import type {PanelStorage} from './storage.ts';
test('signed handler dispatches accepted actor and rejects cookies without repository calls',async()=>{
 let calls=0;const storage={claimTransport:async()=>{}} as unknown as PanelStorage;
 const handle=createPanelHandler({now:()=>1790164800000,readConfiguration:syntheticConfiguration,storage,read:async(_op,_args,principal)=>{calls++;assert.equal(principal.actorSteamId,'76561198000000001');return {balance:'0',lifetimeEarned:'0',lifetimeSpent:'0'};},mutate:async()=>{throw Error('not expected');},receipt:async()=>null,restore:async()=>null});
 const unauth=await handle(new Request('https://portal.test/api/game-panel/v1/wallet.read',{method:'POST',headers:{cookie:'portal_session=synthetic','content-type':'application/json'},body:'{}'}),'wallet.read');assert.equal(unauth.status,401);assert.equal(calls,0);assert.equal(unauth.headers.get('cache-control'),'private, no-store');assert.equal((await unauth.json()).operationId,null);
 const valid=await handle(signedRequest(),'wallet.read');assert.equal(valid.status,200);assert.equal(calls,1);assert.equal((await valid.json()).data.balance,'0');
});
