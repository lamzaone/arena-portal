import test from "node:test";
import assert from "node:assert/strict";
import { normalizeWeaponThumbnail, thumbnailSignature, thumbnailFrameUrl, thumbnailForSource } from "./weapon-thumbnail.ts";
import models from "./cs2-skin-models.json" with { type: "json" };
import { fromInspectLink } from "@skinhub/viewer";

const base = { defindex: 7, paintIndex: 44, float: 0.123456789, seed: 661, statTrak: false };
test("thumbnail identity includes exact float, seed, finish, StatTrak and attachment placement", () => {
  const key = thumbnailSignature(normalizeWeaponThumbnail(base));
  for (const patch of [{float:0.123456788},{seed:660},{paintIndex:180},{statTrak:0},{nameTag:'Test'},{stickers:[{slot:4,id:37,offsetX:0.12}]}])
    assert.notEqual(thumbnailSignature(normalizeWeaponThumbnail({...base,...patch})),key);
  assert.equal(normalizeWeaponThumbnail(base).float,base.float);
});
test("normalization is canonical and rejects invalid identity/placements", () => {
  assert.equal(thumbnailSignature(normalizeWeaponThumbnail({...base,stickers:[{slot:4,id:37},{slot:0,id:38}]})),thumbnailSignature(normalizeWeaponThumbnail({...base,stickers:[{slot:0,id:38},{slot:4,id:37}]})));
  for(const patch of [{defindex:9999},{float:NaN},{seed:1001},{statTrak:'false'},{stickers:[{slot:0,id:37},{slot:0,id:38}]},{charm:{id:5,offset:[Infinity,0,0]}}])
    assert.throws(()=>normalizeWeaponThumbnail({...base,...patch}));
});
test("frame configuration includes attachments and never enables ordinary StatTrak", () => {
  const item=normalizeWeaponThumbnail({...base,stickers:[{id:37,slot:4,rotation:45}],charm:{id:5,seed:123,offset:[1,2,3]}});
  const url=new URL(thumbnailFrameUrl(item));
  assert.equal(url.origin,'https://skinhub.gg');
  assert.equal(url.searchParams.get('float'),'0.123456789');
  assert.equal(url.searchParams.get('seed'),'661');
  assert.equal(url.searchParams.get('st'),'-1');
  assert.ok(url.searchParams.get('i'));
  assert.equal(url.searchParams.get('weapon'),'weapon_ak47');
  const decoded = fromInspectLink(url.searchParams.get('i')!);
  assert.ok(decoded);
  assert.equal(decoded.stickers?.[4]?.id ?? decoded.stickers?.[0]?.id,37);
  assert.equal(decoded.charm?.seed,123);
});
test("every renderer-supported gun, knife and glove can use an exact thumbnail", () => {
  for (const key of Object.keys(models.variants)) {
    const [definitionIndex, paintkit] = key.split(':').map(Number);
    const preview = thumbnailForSource({itemType:'weapon',definitionIndex,paintkit,floatValue:.123456789,seed:661,stattrak:false,stattrakCount:99});
    assert.ok(preview, key);
    assert.equal(preview.item.float,.123456789);
    assert.equal(preview.item.seed,661);
    assert.equal(preview.item.statTrak,false);
    assert.equal(preview.sample,false);
  }
});
test("unrolled catalogue art is explicitly a sample; unavailable renderer finishes are not substituted", () => {
  const source={itemType:'skin',definitionIndex:7,paintkit:44,floatValue:null,seed:null};
  assert.equal(thumbnailForSource(source)?.sample,true);
  assert.equal(thumbnailForSource(source,.2,617)?.item.seed,617);
  assert.equal(thumbnailForSource({...source,paintkit:99999}),null);
  const custom = thumbnailForSource({...source,definitionIndex:4,floatValue:.12,seed:661});
  assert.equal(custom?.item.defindex,4);
  assert.equal(custom?.item.paintIndex,44);
});
