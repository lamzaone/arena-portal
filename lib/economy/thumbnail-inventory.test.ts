import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { createInventoryThumbnailPrewarmer, ownedThumbnailPrewarmEnabled } from "./thumbnail-inventory.ts";
import { thumbnailForSource } from "./weapon-thumbnail.ts";
import { type WeaponThumbnail } from "./weapon-thumbnail.ts";

function fixture(t: TestContext) {
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  db.exec(`CREATE TABLE portal_economy_catalogue (id INTEGER PRIMARY KEY,metadata TEXT);
    CREATE TABLE portal_inventory_items (id TEXT PRIMARY KEY,owner_steam_id TEXT,catalogue_id INTEGER,item_type TEXT,definition_index INTEGER,paintkit INTEGER,float_value REAL,seed INTEGER,stattrak INTEGER,stattrak_count INTEGER,nametag TEXT,attributes TEXT,state TEXT,updated_at INTEGER);
    CREATE TABLE portal_inventory_item_stickers (weapon_item_id TEXT,sticker_slot INTEGER,sticker_definition_index INTEGER,attributes TEXT);
    INSERT INTO portal_economy_catalogue VALUES(1,'{"useLegacyModel":true}');`);
  const insert=(id:string,overrides:Record<string,unknown>={})=>{
    const row={id,owner_steam_id:'76561198000000001',catalogue_id:1,item_type:'skin',definition_index:7,paintkit:44,float_value:.15,seed:661,stattrak:0,stattrak_count:0,nametag:null,attributes:'{}',state:'available',updated_at:1,...overrides};
    db.prepare(`INSERT INTO portal_inventory_items (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(()=>'?').join(',')})`).run(...Object.values(row) as (string|number|null)[]);
  };
  const queries:string[]=[],items:WeaponThumbnail[]=[],owners:string[]=[];
  let busy=false;
  let unavailableSeed:number|null=null;
  const worker=createInventoryThumbnailPrewarmer({
    readRows:async(sql,values)=>{assert.match(sql.trim(),/^SELECT/);queries.push(sql);return db.prepare(sql).all(...values as (string|number)[]);},
    request:async(item,owner,options)=>{assert.deepEqual(options,{background:true});items.push(item);owners.push(owner);return {key:'a'.repeat(64),status:busy?'busy':item.seed===unavailableSeed?'unavailable':'queued',retryAfterMs:0};},
  });
  return {db,insert,worker,queries,items,owners,setBusy:(value:boolean)=>{busy=value;},setUnavailableSeed:(value:number)=>{unavailableSeed=value;}};
}
test('owned prewarming uses full authoritative identity, including sticker transforms and charm, without writes',async t=>{
  const f=fixture(t);
  const attributes={keychain:{id:5,seed:123,offsetX:.2,offsetY:.1,offsetZ:0}};
  const placement={wear:.3,rotation:45,offsetX:.1,offsetY:.2,schema:1};
  f.insert('owned',{attributes:JSON.stringify(attributes),nametag:'My weapon',stattrak:1,stattrak_count:42});
  f.db.prepare('INSERT INTO portal_inventory_item_stickers VALUES(?,?,?,?)').run('owned',2,37,JSON.stringify(placement));
  f.insert('sold',{state:'sold'});f.insert('attached',{state:'attached'});f.insert('sticker',{item_type:'sticker'});
  f.insert('unknown-float',{float_value:null});
  await f.worker.runOnce();
  const expected=thumbnailForSource({itemType:'skin',definitionIndex:7,paintkit:44,floatValue:.15,seed:661,stattrak:true,stattrakCount:42,nametag:'My weapon',raw:{attributes,catalogue:{metadata:{useLegacyModel:true}},stickers:[{slot:2,definitionIndex:37,attributes:placement}]}})!.item;
  assert.deepEqual(f.items,[expected]);assert.deepEqual(f.owners,['76561198000000001']);
  assert.equal(f.queries.length,3,'Two bounded item queries and one batched sticker query');
});
test('backfill reaches old items and retries queue overflow while recent customization changes are prioritized',async t=>{
  const f=fixture(t);
  for(let index=0;index<140;index++)f.insert(String(index).padStart(3,'0'),{seed:index,updated_at:index});
  f.setBusy(true);await f.worker.runOnce();assert.equal(f.items[0].seed,139);
  f.items.length=0;f.setBusy(false);await f.worker.runOnce();await f.worker.runOnce();
  assert.equal(new Set(f.items.map(item=>item.seed)).size,140,'Busy scans must not skip the backfill');
  f.items.length=0;f.db.prepare('UPDATE portal_inventory_items SET seed=999,updated_at=1000 WHERE id=?').run('000');
  await f.worker.runOnce();assert.equal(f.items[0].seed,999);
});
test('server prewarming is opt-in because browsers now render missing snapshots',()=>{
  assert.equal(ownedThumbnailPrewarmEnabled({}),false);
  assert.equal(ownedThumbnailPrewarmEnabled({ARENA_HOSTING_ROOT:'/home/site',NODE_ENV:'production'}),false);
  assert.equal(ownedThumbnailPrewarmEnabled({ARENA_HOSTING_ROOT:'/home/site',NODE_ENV:'production',WEAPON_THUMBNAIL_PREWARM_ENABLED:'false'}),false);
  assert.equal(ownedThumbnailPrewarmEnabled({WEAPON_THUMBNAIL_PREWARM_ENABLED:'true'}),true);
  assert.equal(ownedThumbnailPrewarmEnabled({WEAPON_THUMBNAIL_PREWARM_ENABLED:'true',NEXT_PHASE:'phase-production-build'}),false);
});

test('one persistently failing render cannot trap the backfill before older items',async t=>{
  const f=fixture(t);
  for(let index=0;index<140;index++)f.insert(String(index).padStart(3,'0'),{seed:index,updated_at:index});
  f.setUnavailableSeed(0);await f.worker.runOnce();await f.worker.runOnce();
  assert.equal(new Set(f.items.map(item=>item.seed)).size,140);
  f.items.length=0;await f.worker.runOnce();
  assert.ok(f.items.some(item=>item.seed===0),'A later sweep retries failures without blocking everyone else');
});

test('concurrent wakeups share one scan and recover after a failed database read',async()=>{
  let reads=0,release!:()=>void,fail=false;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const worker=createInventoryThumbnailPrewarmer({
    readRows:async()=>{reads++;if(fail)throw new Error('database unavailable');await gate;return [];},
    request:async()=>{throw new Error('No inventory items');},
  });
  const first=worker.runOnce();assert.equal(first,worker.runOnce());assert.equal(reads,1);
  release();await first;assert.equal(reads,2);
  fail=true;await assert.rejects(worker.runOnce(),/database unavailable/);
  fail=false;await worker.runOnce();assert.equal(reads,5);
});
