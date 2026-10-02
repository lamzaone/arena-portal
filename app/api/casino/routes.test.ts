import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import { extname, resolve } from 'node:path';
import test, { after, beforeEach } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const control = { signedIn:true, csrf:true, error:null as null|{code:string;message:string}, calls:[] as Array<{method:string;input:Record<string,unknown>}> };
// Load the actual framework class before sync hooks affect CommonJS exports.
const nextServer = createRequire(import.meta.url)('next/server');
Object.assign(globalThis,{__casinoRouteControl:control,__casinoRouteNextResponse:nextServer.NextResponse});
function moduleUrl(path:string) {const file=(extname(path)?[path]:[`${path}.ts`,`${path}.tsx`,resolve(path,'index.ts')]).find(existsSync); return file?pathToFileURL(file).href:null;}
const hooks = registerHooks({resolve(specifier,context,next){
  const stubs: Record<string,string> = {
    'server-only':'export {};',
    'next/server':'export const NextResponse = globalThis.__casinoRouteNextResponse;',
    '@/lib/auth/session': 'export async function getSession(){return globalThis.__casinoRouteControl.signedIn?{steamId:"76561198000000001"}:null} export function verifyEconomyActionToken(){return globalThis.__casinoRouteControl.csrf}',
    '@/lib/data/casino-repository': ['getCasinoBootstrap','playCasinoInstant','startCasinoBlackjack','actCasinoBlackjack','betCasinoCrash','cashoutCasinoCrash'].map(method=>`export async function ${method}(input){const c=globalThis.__casinoRouteControl;c.calls.push({method:${JSON.stringify(method)},input}); if(c.error)throw Object.assign(new Error(c.error.message),{code:c.error.code});return {balance:123,round:{id:"fixture"},settings:{enabled:true},history:[]}}`).join(' '),
  };
  if(stubs[specifier]) return {url:`data:text/javascript,${stubs[specifier]}`,shortCircuit:true};
  const url=specifier.startsWith('@/')?moduleUrl(resolve(specifier.slice(2))):specifier.startsWith('.')&&context.parentURL?.startsWith('file:')?moduleUrl(fileURLToPath(new URL(specifier,context.parentURL))):null;
  return url?{url,shortCircuit:true}:next(specifier,context);
}});
after(()=>hooks.deregister());
beforeEach(()=>{control.signedIn=true;control.csrf=true;control.error=null;control.calls=[];});
const imports = async()=>Promise.all([import('./state/route.ts'),import('./play/route.ts'),import('./blackjack/route.ts'),import('./crash/bet/route.ts'),import('./crash/cashout/route.ts')]);
const body={csrf:'fixture-csrf',idempotencyKey:'fixture-casino-route-request',stake:20,game:'roulette',selection:{kind:'number',value:1},roundId:'10000000-0000-4000-8000-000000000001',action:'stand'};
const request=(data:unknown=body)=>new Request('https://portal.test/api/casino/play',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
test('all casino routes require Steam sessions and set no-store even on rejection',async()=>{
  const [state,...posts]=await imports();control.signedIn=false;
  for(const response of [await state.GET(),...await Promise.all(posts.map(route=>route.POST(request())))]) {
    assert.equal(response.status,401);assert.match(response.headers.get('Cache-Control')??'',/no-store/);
  }
  assert.equal(control.calls.length,0);
});
test('all mutations reject invalid CSRF and request identity before repository work',async()=>{
  const [, ...posts]=await imports(); control.csrf=false;
  for(const route of posts)assert.equal((await route.POST(request())).status,403);
  control.csrf=true;
  for(const route of posts)assert.equal((await route.POST(request({...body,idempotencyKey:'short'}))).status,400);
  assert.equal(control.calls.length,0);
});
test('route commands use session identity and exclude browser financial authority',async()=>{
  const [state,play,blackjack,bet,cashout]=await imports();
  assert.equal((await state.GET()).status,200);
  assert.equal((await play.POST(request({...body,steamId:'forged',payout:999999}))).status,200);
  assert.equal((await blackjack.POST(request({...body,action:'start'}))).status,200);
  assert.equal((await blackjack.POST(request(body))).status,200);
  assert.equal((await bet.POST(request({...body,autoCashout:150}))).status,200);
  assert.equal((await cashout.POST(request({...body,multiplier:9999,serverTime:1}))).status,200);
  for(const call of control.calls.filter(call=>call.method!=='getCasinoBootstrap')) {
    assert.equal(call.input.steamId,'76561198000000001');assert.equal(call.input.payout,undefined);assert.equal(call.input.multiplier,undefined);assert.equal(call.input.serverTime,undefined);
  }
});
test('disabled casino and missing migration return useful unavailable errors',async()=>{
  const [state,play]=await imports();
  for(const code of ['casino_disabled','casino_unavailable','slots_unavailable']){
    control.error={code,message:'Casino prerequisite unavailable'};
    const response=await play.POST(request());assert.equal(response.status,503);assert.match((await response.json()).message,/unavailable/);assert.match(response.headers.get('Cache-Control')??'',/no-store/);
  }
  assert.equal((await state.GET()).status,503);
});
