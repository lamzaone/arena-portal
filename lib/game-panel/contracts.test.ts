import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePanelRequest, parseTokens } from './validation.ts';
const request = (args: unknown) => ({ actorSteamId: '76561198000000001', operationId: '1790164800000_00112233445566778899aabbccddeeff', arguments: args });
test('Tokens preserve the maximum safe integer and reject ambiguous values', () => {
  assert.equal(parseTokens('9007199254740991'), Number.MAX_SAFE_INTEGER);
  for (const value of ['9007199254740992', '1e3', '-1', '01', 1000]) assert.throws(() => parseTokens(value));
});
test('strict arguments reject identity overrides, duplicates and oversized batches', () => {
  const id = '10000000-0000-4000-8000-000000000001';
  for (const args of [{itemIds:[id],saleLocked:true,steamId:'76561198000000002'}, {itemIds:[id,id],saleLocked:true}, {itemIds:Array(51).fill(id),saleLocked:true}]) assert.throws(() => parsePanelRequest('inventory.protect',request(args)));
});
test('global music slots cannot contain a team and slots cannot repeat', () => {
  for (const slots of [[{slotType:'music_kit',team:'T'}], [{slotType:'music_kit'},{slotType:'music_kit'}]]) assert.throws(() => parsePanelRequest('loadout.clear', request({slots})));
});
test('filters support full-result sorts, category and definition index', () => {
  const parsed = parsePanelRequest('market.read', request({sort:'name',category:'rifles',definitionIndex:7}));
  assert.equal((parsed.arguments as {sort:string}).sort,'name');
  assert.throws(() => parsePanelRequest('market.read',request({sort:'random'})));
  assert.throws(() => parsePanelRequest('market.read',request({itemTypes:['admin_override']})));
  assert.throws(() => parsePanelRequest('market.read',request({rarityRanks:[9]})));
});
test('text controls, non-finite numbers and online identity forgery are rejected',()=>{
 const id='10000000-0000-4000-8000-000000000001';
 for(const nametag of ['', 'a'.repeat(129), 'name\ncommand']) assert.throws(()=>parsePanelRequest('customize.rename',request({itemId:id,nametag})));
 for(const floatValue of [NaN,Infinity,-0.1,1.1]) assert.throws(()=>parsePanelRequest('market.quote',request({catalogueId:1,quantity:1,stattrak:false,floatValue})));
 for(const onlineSteamIds of [['76561198000000001','76561198000000001'],['wrong'],undefined])assert.throws(()=>parsePanelRequest('trades.partners',request({query:'test',onlineSteamIds})));
});
test('actor SteamIDs use the complete individual account range',()=>{
 for(const actorSteamId of ['76561197960265728','76561202255233023'])assert.doesNotThrow(()=>parsePanelRequest('wallet.read',{...request({}),actorSteamId}));
 for(const actorSteamId of ['76561197960265727','76561202255233024','76561190000000000'])assert.throws(()=>parsePanelRequest('wallet.read',{...request({}),actorSteamId}));
});
