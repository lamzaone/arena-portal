import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
registerHooks({resolve(specifier,context,next){
  if(specifier==='server-only')return {url:'data:text/javascript,export {};',shortCircuit:true};
  const path=specifier.startsWith('@/')?resolve(specifier.slice(2)):specifier.startsWith('.')&&context.parentURL?.startsWith('file:')?fileURLToPath(new URL(specifier,context.parentURL)):null;
  const file=path&&(extname(path)?[path]:[`${path}.ts`,`${path}.tsx`]).find(existsSync);
  return file?{url:pathToFileURL(file).href,shortCircuit:true}:next(specifier,context);
}});
const MAX='18446744073709551615';
test('full UInt64 wallet and lifetime counters serialize without precision loss',async()=>{
 const {serializeWallet}=await import('../game-panel/serialization.ts');
 const wallet={balance:MAX,lifetimeEarned:'36893488147419103230',lifetimeSpent:MAX};
 assert.deepEqual(serializeWallet(wallet as never),wallet);
});
test('full UInt64 balances remain affordable and formatted exactly',async()=>{
 const {economyWallet,formatTokens}=await import('../../components/economy/economy-view-model.ts');
 const {canAffordCratePurchase}=await import('./crate-presentation.ts');
 assert.equal(economyWallet({balance:MAX}).balance,MAX);
 assert.equal(formatTokens(MAX),'18,446,744,073,709,551,615');
 assert.equal(canAffordCratePurchase(MAX,100,50),true);
});
test('wallet mutation spends precisely above 2^53 and persists decimal strings',async()=>{
 const {applyTokenDelta}=await import('../data/portal-repository.ts');
 const writes:unknown[][]=[];
 const connection={query:async()=>[[]],execute:async(_sql:string,args:unknown[])=>{writes.push(args);return [{}];}};
 const wallets=new Map([['76561198000000001',{steamId:'76561198000000001',balance:MAX,lifetimeEarned:MAX,lifetimeSpent:'0',createdAt:null,updatedAt:null}]]);
 const input={connection:connection as never,wallets,steamId:'76561198000000001',delta:-1,reason:'test',referenceType:'test',referenceId:'test',idempotencyKey:'test',lineKey:'test',actorSteamId:null};
 assert.equal((await applyTokenDelta(input)).balance,'18446744073709551614');
 assert.deepEqual(writes[0].slice(0,3),['18446744073709551614',MAX,'1']);
 assert.equal((await applyTokenDelta({...input,delta:1})).lifetimeEarned,'18446744073709551616');
 await assert.rejects(applyTokenDelta({...input,delta:1}),{code:'token_limit'});
 assert.equal((await applyTokenDelta({...input,delta:'-'+MAX})).balance,'0');
 assert.equal(writes.at(-1)?.[1],'-'+MAX);
 await assert.rejects(applyTokenDelta({...input,delta:-1}),{code:'insufficient_tokens'});
});

test('Token input accepts the full UInt64 range and rejects rounded or malformed amounts',async()=>{
 const {tokenAmountField}=await import('./token-amount.ts');
 for(const value of [MAX,'0','9007199254740993']) assert.equal(tokenAmountField(value),value);
 for(const value of ['18446744073709551616','-1','1e6','1.5','',null,Number.MAX_SAFE_INTEGER+1]) assert.equal(tokenAmountField(value),null);
});
test('locking accounts preserves database UInt64 balances and large turnover',async()=>{
 const {lockTokenAccounts}=await import('../data/portal-repository.ts');
 const connection={execute:async()=>[{}],query:async()=>[[{steam_id:'76561198000000001',balance:MAX,lifetime_earned:'36893488147419103230',lifetime_spent:MAX,created_at:null,updated_at:null}]]};
 const wallet=(await lockTokenAccounts(connection as never,['76561198000000001'])).get('76561198000000001')!;
 assert.equal(wallet.balance,MAX);
 assert.equal(wallet.lifetimeEarned,'36893488147419103230');
 assert.doesNotThrow(()=>JSON.stringify(wallet));
});
test('reserved payouts protect UInt64 headroom while lifetime turnover can exceed UInt64',async()=>{
 const {applyTokenDelta}=await import('../data/portal-repository.ts');
 let writes=0;
 const connection={query:async()=>[[{maximum_return:'5'}]],execute:async()=>{writes++;return [{}];}};
 const wallets=new Map([['76561198000000001',{steamId:'76561198000000001',balance:(BigInt(MAX)-6n).toString(),lifetimeEarned:MAX,lifetimeSpent:'0',createdAt:null,updatedAt:null}]]);
 const input={connection:connection as never,wallets,steamId:'76561198000000001',delta:1,reason:'test',referenceType:'test',referenceId:'test',idempotencyKey:'test',lineKey:'test',actorSteamId:null};
 assert.equal((await applyTokenDelta(input)).balance,(BigInt(MAX)-5n).toString());
 assert.equal(writes,2);
 await assert.rejects(applyTokenDelta(input),{code:'token_limit'});
 assert.equal(writes,2);
});
