import { PANEL_OPERATIONS, type PanelArguments, type PanelOperation, type PanelRequest } from './contracts.ts';
import { PanelApiError } from './errors.ts';
import { ECONOMY_ITEM_TYPES, ECONOMY_RARITY_RANKS } from '../economy/item-taxonomy.ts';
import { isIndividualSteamId64 } from '../steam/steam-id.ts';
const invalid = ():never => {throw new PanelApiError(400,'invalid_input','Choose valid operation arguments.');};
export const isPanelSteamId = isIndividualSteamId64;
export const OPERATION_ID = /^[0-9]{13}_[a-f0-9]{32}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function parseTokens(value:unknown):number {if(typeof value !== 'string' || !/^(0|[1-9][0-9]{0,15})$/.test(value) || BigInt(value)>BigInt(Number.MAX_SAFE_INTEGER)) invalid();return Number(value);}
export function operationCreatedAt(value:string):number {if(!OPERATION_ID.test(value)) invalid();return Number(value.slice(0,13));}
type Check = (v:unknown)=>void;
const text = (min:number,max:number,pattern?:RegExp):Check => v => {if(typeof v !== 'string'||v.length<min||v.length>max||/[\u0000-\u001f\u007f-\u009f]/.test(v)||(pattern&&!pattern.test(v))) invalid();};
const integer = (min:number,max=Number.MAX_SAFE_INTEGER):Check => v => {if(typeof v!=='number'||!Number.isSafeInteger(v)||v<min||v>max) invalid();};
const fraction:Check = v => {if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1) invalid();};
const boolean:Check = v => {if(typeof v!=='boolean') invalid();};
const oneOf = (values:readonly unknown[]):Check => v => {if(!values.includes(v)) invalid();};
const array = (check:Check,min:number,max:number):Check => v => {if(!Array.isArray(v)||v.length<min||v.length>max) invalid();const a=v as unknown[];a.forEach(check);if(new Set(a.map(x=>JSON.stringify(x))).size!==a.length) invalid();};
function object(v:unknown,required:Record<string,Check>,optional:Record<string,Check>={}):Record<string,unknown> {if(!v||typeof v!=='object'||Array.isArray(v)) invalid();const o=v as Record<string,unknown>;for(const key of Object.keys(o)) if(!Object.hasOwn(required,key)&&!Object.hasOwn(optional,key)) invalid();for(const [key,check] of Object.entries(required)){if(!Object.hasOwn(o,key)) invalid();check(o[key]);}for(const [key,check] of Object.entries(optional))if(Object.hasOwn(o,key))check(o[key]);return o;}
const steam:Check = value => {if(typeof value!=='string'||!isPanelSteamId(value))invalid();};
const id = text(36,36,UUID), operationId=text(46,46,OPERATION_ID), ids=array(id,1,50);
const paging={page:integer(1,100000),pageSize:oneOf([12,24,48])};
const filters={...paging,query:text(0,64),itemTypes:array(oneOf(ECONOMY_ITEM_TYPES),1,ECONOMY_ITEM_TYPES.length),rarityRanks:array(oneOf(ECONOMY_RARITY_RANKS),1,ECONOMY_RARITY_RANKS.length),sort:oneOf(['newest','name','rarity','float','price']),category:oneOf(['rifles','snipers','pistols','smgs','shotguns','lmgs','other']),definitionIndex:integer(1,65535)};
const slot:Check = v => {const type=(v as {slotType?:unknown})?.slotType;if(type==='music_kit')object(v,{slotType:oneOf(['music_kit'])});else if(type==='weapon')object(v,{slotType:oneOf(['weapon']),team:oneOf(['T','CT']),definitionIndex:integer(1,65535)});else object(v,{slotType:oneOf(['knife','glove','agent']),team:oneOf(['T','CT'])});};
const slots:Check = v => {array(slot,1,2)(v);const keys=(v as {slotType:string;team?:string;definitionIndex?:number}[]).map(s=>`${s.slotType}:${s.team??''}:${s.definitionIndex??''}`);if(new Set(keys).size!==keys.length)invalid();};
const online=array(steam,0,64), selection={catalogueId:integer(1),quantity:integer(1,50),stattrak:boolean}, selectionOptional={floatValue:fraction,seed:integer(0,1000)};
export function parsePanelRequest(operation:string,value:unknown):PanelRequest<PanelArguments[PanelOperation]> {
  if(!PANEL_OPERATIONS.includes(operation as PanelOperation)) throw new PanelApiError(404,'unknown_operation','Operation not found.');
  const envelope=object(value,{actorSteamId:steam,operationId,arguments:()=>{}}), args=envelope.arguments;
  switch(operation as PanelOperation){
    case 'wallet.read':case 'loadout.read':object(args,{});break;
    case 'inventory.read':object(args,{}, {...filters,hideEquipped:boolean});break;
    case 'cases.read':object(args,{},filters);break;
    case 'market.read':{const a=object(args,{}, {...filters,minFloat:fraction,maxFloat:fraction});if(typeof a.minFloat==='number'&&typeof a.maxFloat==='number'&&a.minFloat>a.maxFloat)invalid();break;}
    case 'inventory.detail':case 'benefits.vip-quote':case 'benefits.vip-activate':case 'benefits.theme-equip':object(args,{itemId:id});break;
    case 'inventory.protect':object(args,{itemIds:ids,saleLocked:boolean});break;
    case 'inventory.sell':object(args,{itemIds:ids});break;
    case 'cases.drops':object(args,{catalogueId:integer(1)},paging);break;
    case 'cases.open':object(args,{crateItemId:id});break;
    case 'cases.open-bulk':case 'cases.reconcile':object(args,{crateItemIds:array(id,1,10)});break;
    case 'market.detail':object(args,{catalogueId:integer(1)});break;
    case 'market.quote':object(args,selection,selectionOptional);break;
    case 'market.purchase':object(args,{...selection,expectedUnitPriceTokens:v=>{parseTokens(v);}},selectionOptional);break;
    case 'loadout.equip':object(args,{itemId:id,slots});break;
    case 'loadout.clear':object(args,{slots});break;
    case 'customize.rename':object(args,{itemId:id,nametag:text(1,128)},{nametagItemId:id});break;
    case 'customize.sticker':object(args,{weaponItemId:id,stickerItemId:id,slot:integer(0,5)});break;
    case 'customize.charm':object(args,{weaponItemId:id,charmItemId:id});break;
    case 'benefits.redeem':object(args,{code:text(1,64)});break;
    case 'trades.partners':object(args,{query:text(2,64),onlineSteamIds:online});break;
    case 'trades.inventory':object(args,{partnerSteamId:steam,onlineSteamIds:online},{...paging,query:text(0,64)});break;
    case 'trades.read':object(args,{}, {...paging,status:array(oneOf(['pending','accepted','rejected','cancelled','expired']),1,5)});break;
    case 'trades.detail':case 'trades.cancel':object(args,{tradeId:id});break;
    case 'trades.create':object(args,{counterpartySteamId:steam,offeredItemIds:array(id,0,50),requestedItemIds:array(id,0,50),offeredTokens:v=>{parseTokens(v);},requestedTokens:v=>{parseTokens(v);},onlineSteamIds:online});break;
    case 'trades.respond':object(args,{tradeId:id,decision:oneOf(['accept','decline'])});break;
    case 'operations.status':object(args,{targetOperationId:operationId});break;
  }
  return envelope as PanelRequest<PanelArguments[PanelOperation]>;
}
