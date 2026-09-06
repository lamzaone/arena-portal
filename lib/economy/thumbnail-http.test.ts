import test from "node:test";
import assert from "node:assert/strict";
import { thumbnailStatusResponse } from "./thumbnail-http.ts";
const item={defindex:7,paintIndex:44,float:.123456789,seed:661,statTrak:false};
const origin=process.env.SITE_URL ? new URL(process.env.SITE_URL).origin : 'https://arena.test';
function request(body: unknown, headers: Record<string,string>={}) {
  return new Request(`${origin}/api/economy/thumbnails`,{method:'POST',headers:{'content-type':'application/json',origin,...headers},body:JSON.stringify(body)});
}
test('thumbnail route authenticates, enforces origin and validates whole batch before starting jobs', async()=>{
  let renders=0;
  const dependencies={session:async()=>({steamId:'owner'}),request:async()=>{renders++;return {key:'a'.repeat(64),status:'queued' as const,retryAfterMs:1500};}};
  assert.equal((await thumbnailStatusResponse(request({items:[item]},{origin:'https://attacker.test'}),dependencies)).status,403);
  assert.equal((await thumbnailStatusResponse(request({items:[item]}),{...dependencies,session:async()=>null})).status,401);
  assert.equal((await thumbnailStatusResponse(request({items:[item,{...item,seed:-1}]}),dependencies)).status,400);
  assert.equal((await thumbnailStatusResponse(request({items:Array(21).fill(item)}),dependencies)).status,400);
  assert.equal((await thumbnailStatusResponse(request({items:[item],padding:'x'.repeat(65536)}),dependencies)).status,413);
  assert.equal(renders,0);
  const response=await thumbnailStatusResponse(request({items:[item]}),dependencies);
  assert.equal(response.status,200);
  assert.equal((await response.json()).tickets[0].src,null);
  assert.equal(renders,1);
});

test('one request starts the whole twenty-item page together',async()=>{
  const requestedSeeds:number[]=[];
  const response=await thumbnailStatusResponse(request({items:Array.from({length:20},(_,seed)=>({...item,seed}))}),{
    session:async()=>({steamId:'owner'}),request:async value=>{
      requestedSeeds.push(value.seed);
      return {key:String(value.seed).padStart(64,'0'),status:'queued',retryAfterMs:500};
    },
  });
  assert.equal(response.status,200);
  assert.deepEqual(requestedSeeds,Array.from({length:20},(_,seed)=>seed));
  assert.equal((await response.json()).tickets.length,20);
});
test('only ready tickets expose immutable image URLs and original float reaches the cache',async()=>{
  const response=await thumbnailStatusResponse(request({items:[item]}),{session:async()=>({steamId:'owner'}),request:async(value,owner)=>{
    assert.equal(owner,'owner');assert.equal(value.float,.123456789);assert.equal(value.statTrak,false);
    return {key:'a'.repeat(64),status:'ready',retryAfterMs:0};
  }});
  assert.equal((await response.json()).tickets[0].src,`/api/economy/thumbnails/${'a'.repeat(64)}`);
  assert.equal(response.headers.get('cache-control'),'no-store');
});

test('a waiting request returns as soon as a worker finishes instead of waiting for another poll',async()=>{
  let completed=false, waits=0, requests=0;
  const input=request({items:[item],waitMs:5000});
  const response=await thumbnailStatusResponse(input,{
    session:async()=>({steamId:'owner'}),
    request:async()=>{requests++;return {key:'a'.repeat(64),status:completed?'ready':'queued',retryAfterMs:500};},
    waitForAny:async(keys,signal,milliseconds)=>{
      waits++;assert.deepEqual(keys,['a'.repeat(64)]);assert.equal(signal,input.signal);assert.equal(milliseconds,5000);completed=true;
    },
  });
  assert.equal(waits,1);assert.equal(requests,2);
  assert.equal((await response.json()).tickets[0].status,'ready');
});

test('cached results return immediately and remaining queued items resume without a fixed polling delay',async()=>{
  let waits=0;
  const response=await thumbnailStatusResponse(request({items:[item,{...item,seed:1}],waitMs:5000}),{
    session:async()=>({steamId:'owner'}),
    request:async value=>({key:'a'.repeat(64),status:value.seed===1?'queued':'ready',retryAfterMs:500}),
    waitForAny:async()=>{waits++;},
  });
  assert.equal(waits,0);
  const body=await response.json();
  assert.equal(body.tickets[0].status,'ready');assert.equal(body.tickets[1].retryAfterMs,0);
});

test('waiting is bounded, opt-in and does not hot-poll unavailable or rate-limited items',async()=>{
  let renders=0, waits=0;
  const dependencies={session:async()=>({steamId:'owner'}),request:async()=>{renders++;return {key:'a'.repeat(64),status:'busy' as const,retryAfterMs:3000};},waitForAny:async()=>{waits++;}};
  for(const waitMs of [-1,5001,Infinity,'5000']) assert.equal((await thumbnailStatusResponse(request({items:[item],waitMs}),dependencies)).status,400);
  assert.equal(renders,0);
  const response=await thumbnailStatusResponse(request({items:[item],waitMs:5000}),dependencies);
  assert.equal(waits,0);assert.equal((await response.json()).tickets[0].retryAfterMs,3000);
});

test('an aborted waiting request does not renew or create jobs after the wait',async()=>{
  const controller=new AbortController();
  const input=new Request(request({items:[item],waitMs:5000}),{signal:controller.signal});
  let requests=0;
  const response=await thumbnailStatusResponse(input,{
    session:async()=>({steamId:'owner'}),
    request:async()=>{requests++;return {key:'a'.repeat(64),status:'queued',retryAfterMs:500};},
    waitForAny:async()=>{controller.abort();},
  });
  assert.equal(requests,1);assert.equal(response.status,499);
});
