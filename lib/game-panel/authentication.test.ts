import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalPanelRequest, hashPanelBody, signPanelRequest } from './signing.ts';
import { authenticatePanelRequest } from './authentication.ts';
import { readPanelConfiguration } from './config.ts';
import {syntheticConfiguration,signedRequest} from './fixtures/auth.ts';
import {readFileSync} from 'node:fs';
const now=1790164800000,key=Buffer.alloc(32,7),actor='76561198000000001';
test('checked-in cross-language signing vector is exact',()=>{const f=JSON.parse(readFileSync(new URL('./fixtures/signature.json',import.meta.url),'utf8'));assert.equal(hashPanelBody(Buffer.from(f.body)),f.bodyHash);assert.equal(canonicalPanelRequest(f),f.canonical);assert.equal(signPanelRequest(Buffer.from(f.secretBase64,'base64'),f.canonical),f.signature);});
test('signed exact bytes authenticate and modified bytes fail before storage',async()=>{
  let claims=0;const deps={now:()=>now,readConfiguration:syntheticConfiguration,storage:{claimTransport:async()=>{claims++;}}};
  const result=await authenticatePanelRequest(signedRequest(),'wallet.read',deps);assert.equal(result.principal.actorSteamId,actor);assert.equal(claims,1);
  const original=signedRequest();const changed=new Request(original.url,{method:'POST',headers:original.headers,body:'{}'});
  await assert.rejects(authenticatePanelRequest(changed,'wallet.read',deps),{code:'authentication_failed'});assert.equal(claims,1);
});
test('cookies, path aliases, expired clocks and invalid config fail closed',async()=>{
  const deps={now:()=>now,readConfiguration:syntheticConfiguration,storage:{claimTransport:async()=>{throw Error('must not claim');}}};
  await assert.rejects(authenticatePanelRequest(new Request('https://portal.test/api/game-panel/v1/wallet.read',{method:'POST',headers:{cookie:'session=synthetic','content-type':'application/json'},body:'{}'}),'wallet.read',deps),{status:401});
  await assert.rejects(authenticatePanelRequest(signedRequest('/api/game-panel/v1/wallet.read?x=1'),'wallet.read',deps));
  await assert.rejects(authenticatePanelRequest(signedRequest(),'wallet.read',{...deps,now:()=>now+61000}),{status:401});
  assert.throws(()=>readPanelConfiguration('[]'));
});
test('every signed identity field is bound and forwarding headers never provide HTTPS',async()=>{
  let claims=0;const deps={now:()=>now,readConfiguration:syntheticConfiguration,storage:{claimTransport:async()=>{claims++;}}};
  for(const [header,value] of [['X-Panel-Server-Id','different'],['X-Panel-Key-Id','b'],['X-Panel-Actor-Steam-Id','76561198000000002'],['X-Panel-Timestamp',String(now/1000+1)],['X-Panel-Request-Id','2'.repeat(32)],['X-Panel-Signature','0'.repeat(64)]]) {
    const original=signedRequest();const headers=new Headers(original.headers);headers.set(header,value);await assert.rejects(authenticatePanelRequest(new Request(original.url,{method:'POST',headers,body:await original.text()}),'wallet.read',deps),{status:401});
  }
  const original=signedRequest();const headers=new Headers(original.headers);headers.set('x-forwarded-proto','https');await assert.rejects(authenticatePanelRequest(new Request(original.url.replace('https:','http:'),{method:'POST',headers,body:await original.text()}),'wallet.read',deps),{status:401});
  assert.equal(claims,0);
});
test('scope removal, key retirement and durable replay rejection fail closed',async()=>{
  let claimed=false;const storage={claimTransport:async()=>{if(claimed)throw Object.assign(new Error('replay'),{code:'request_replayed'});claimed=true;}};
  const deps={now:()=>now,readConfiguration:syntheticConfiguration,storage};
  await authenticatePanelRequest(signedRequest(),'wallet.read',deps);await assert.rejects(authenticatePanelRequest(signedRequest(),'wallet.read',deps),{code:'request_replayed'});
  await assert.rejects(authenticatePanelRequest(signedRequest(),'wallet.read',{...deps,readConfiguration:()=>syntheticConfiguration().map(s=>({...s,allowedOperations:new Set()}))}),{status:403});
  await assert.rejects(authenticatePanelRequest(signedRequest(),'wallet.read',{...deps,readConfiguration:()=>syntheticConfiguration().map(s=>({...s,keys:s.keys.map(k=>({...k,notAfter:now}))}))}),{status:401});
});
test('stream limit holds without content-length and compressed bodies are rejected',async()=>{
  const deps={now:()=>now,readConfiguration:syntheticConfiguration,storage:{claimTransport:async()=>{throw Error('must not claim');}}};
  const oversized=signedRequest('/api/game-panel/v1/wallet.read',' '.repeat(32769));await assert.rejects(authenticatePanelRequest(oversized,'wallet.read',deps),{status:413});
  const original=signedRequest();const headers=new Headers(original.headers);headers.set('content-encoding','gzip');await assert.rejects(authenticatePanelRequest(new Request(original.url,{method:'POST',headers,body:await original.text()}),'wallet.read',deps),{status:400});
});
test('configuration rejects nonexistent dates and admits rotation overlap',()=>{
 const base={serverId:'arena-test',allowedOperations:['wallet.read'],keys:[{keyId:'a',secretBase64:key.toString('base64'),notBefore:'2026-02-31T00:00:00Z',notAfter:'2027-01-01T00:00:00Z'}]};
 assert.throws(()=>readPanelConfiguration(JSON.stringify([base])));
 base.keys[0].notBefore='2026-01-01T00:00:00Z';base.keys.push({...base.keys[0],keyId:'b'});assert.equal(readPanelConfiguration(JSON.stringify([base]))[0].keys.length,2);
});
