import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { join } from "node:path";
import { createThumbnailCache } from "../lib/economy/thumbnail-cache.ts";
import { createWeaponThumbnailRenderer } from "../lib/economy/thumbnail-renderer.ts";
import { thumbnailAssetCacheDirectory, thumbnailImageCacheDirectory } from "../lib/economy/thumbnail-paths.ts";
import { thumbnailForSource, thumbnailSignature } from "../lib/economy/weapon-thumbnail.ts";
import { parseThumbnailWarmupOptions, selectThumbnailModelRepresentatives } from "./weapon-thumbnail-warmup.mjs";

// Read-only database access; --models uses static manifests without a database.
// This command writes only disposable cached images and browser model assets.
// Preserve explicitly supplied environment settings over local env files.
const suppliedEnvironment = { ...process.env };
for (const name of [".env", ".env.production", ".env.local"]) if (existsSync(name)) loadEnvFile(name);
Object.assign(process.env, suppliedEnvironment);
const args=process.argv.slice(2);
if(args.includes("--help")) {
  console.log("npm run thumbnails:warm -- [--inventory|--catalogue|--models] [--limit=100] [--profile=warmer|server]\nDefault: available inventory first, then catalogue sample float/seed. Resumes from persistent image cache. No database writes.\n--models: preload one released finish per supported weapon/knife/glove mesh generation; no database required. Model assets are loaded even when the final image is cached.\n--profile=warmer (default): use a separate persistent browser profile.\n--profile=server: offline/startup warmup only; the server Chromium profile must not already be open.");
  process.exit(0);
}
const options=parseThumbnailWarmupOptions(args);
const {limit}=options;
if(!options.models && !process.env.PORTAL_DATABASE_URL)throw new Error("PORTAL_DATABASE_URL is required");
const pool=options.models ? null : (await import("mysql2/promise")).default.createPool(process.env.PORTAL_DATABASE_URL);
const renderer=createWeaponThumbnailRenderer({assetCacheDirectory:join(thumbnailAssetCacheDirectory(),options.profile)});
let primed;
const cache=createThumbnailCache({directory:thumbnailImageCacheDirectory(),render:item=>primed?.signature===thumbnailSignature(item) ? Promise.resolve(primed.image) : renderer.render(item),maxNewPerHour:Number.MAX_SAFE_INTEGER});
const seen=new Set();
let ready=0,failed=0,unsupported=0;
const record=value=>typeof value==='string'?JSON.parse(value):value??{};
async function warm(source) {
  if(seen.size>=limit)return;
  const preview=thumbnailForSource(source);
  if(!preview){unsupported++;return;}
  const signature=thumbnailSignature(preview.item);
  if(seen.has(signature))return;
  seen.add(signature);
  let ticket;
  try {
    // Existing final images do not populate a newly created browser profile.
    // Force model loading once and reuse that render if the image is missing.
    if(options.models)primed={signature,image:await renderer.render(preview.item)};
    ticket=await cache.request(preview.item,"prewarm");
    await cache.drain();
    if((await cache.request(preview.item,"prewarm")).status==='ready')ready++;else failed++;
  } catch {failed++;}
  finally {primed=undefined;}
  console.log(JSON.stringify({processed:seen.size,ready,failed,unsupported,lastStatus:ticket?.status??"unavailable"}));
}
try {
  if(options.models) {
    const representatives=selectThumbnailModelRepresentatives({limit});
    console.log(JSON.stringify({mode:"models",profile:options.profile,representatives:representatives.length}));
    for(const source of representatives)await warm(source);
  }
  if(options.inventory) {
    const [rows]=await pool.query("SELECT id,item_type,definition_index,paintkit,float_value,seed,stattrak,stattrak_count,nametag,attributes FROM portal_inventory_items WHERE state IN ('available','escrowed') AND item_type IN ('skin','knife','glove') ORDER BY updated_at DESC");
    // Bounded batches keep large inventories away from huge SQL IN clauses.
    for(let start=0;start<rows.length && seen.size<limit;start+=100) {
      const batch=rows.slice(start,start+100);
      const [stickers]=await pool.query(`SELECT weapon_item_id,sticker_slot,sticker_definition_index,attributes FROM portal_inventory_item_stickers WHERE weapon_item_id IN (${batch.map(()=>'?').join(',')})`,batch.map(row=>row.id));
      for(const row of batch) await warm({itemType:row.item_type,definitionIndex:row.definition_index,paintkit:row.paintkit,floatValue:row.float_value==null?null:Number(row.float_value),seed:row.seed,stattrak:row.stattrak===1,stattrakCount:row.stattrak_count,nametag:row.nametag,
        raw:{attributes:record(row.attributes),stickers:stickers.filter(sticker=>sticker.weapon_item_id===row.id).map(sticker=>({slot:sticker.sticker_slot,definitionIndex:sticker.sticker_definition_index,attributes:record(sticker.attributes)}))}});
    }
  }
  if(options.catalogue && seen.size<limit) {
    const [rows]=await pool.query("SELECT item_type,definition_index,paintkit FROM portal_economy_catalogue WHERE enabled=1 AND item_type IN ('skin','knife','glove') ORDER BY rarity_rank DESC,id");
    for(const row of rows) await warm({itemType:row.item_type,definitionIndex:row.definition_index,paintkit:row.paintkit,seed:null,floatValue:null,stattrak:false});
  }
  console.log(JSON.stringify({complete:true,ready,failed,unsupported}));
  if(failed)process.exitCode=1;
} finally {await renderer.close();await pool?.end();}
