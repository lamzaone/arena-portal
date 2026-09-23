import { createHash } from 'node:crypto';
import type { OperationStatus, PanelOperation, PanelPrincipal } from './contracts.ts';
import { PanelApiError, errorData } from './errors.ts';
import { assertExecutionAge, type PanelMutationContext, type PanelOperationRecord, type PanelStorage } from './storage.ts';
import { operationCreatedAt } from './validation.ts';
export type { PanelMutationContext } from './storage.ts';
export const repositoryOperationNames:Partial<Record<PanelOperation,string>> = {'inventory.protect':'inventory.sale-lock.set','inventory.sell':'marketplace.sale.bulk','cases.open':'crate.open','cases.open-bulk':'crate.open.bulk','market.purchase':'marketplace.purchase','loadout.equip':'loadout.equip','loadout.clear':'loadout.clear','customize.rename':'item.nametag.set','customize.sticker':'item.sticker.attach','customize.charm':'item.charm.attach','benefits.vip-activate':'inventory.group_membership.activate','benefits.theme-equip':'inventory.profile_theme.equip','benefits.redeem':'redeem-code.claim','trades.create':'trade.create','trades.respond':'trade.respond','trades.cancel':'trade.cancel'};
export function deriveEconomyKey(principal:Pick<PanelPrincipal,'serverId'|'actorSteamId'>,operationId:string):string {return 'gp1_'+createHash('sha256').update([principal.serverId,principal.actorSteamId,operationId].join('\n')).digest('hex');}
export type PanelReceipt = {status:'pending'|'completed'|'rejected'|'manual_review';result:unknown|null;error?:unknown};
export type JournalDependencies = {storage:PanelStorage;now:()=>number;receipt:(context:PanelMutationContext)=>Promise<PanelReceipt|null>;restore:(context:PanelMutationContext,result:unknown)=>Promise<unknown>};
function uncertain():PanelApiError{return new PanelApiError(409,'operation_uncertain','The result is not confirmed. Check this operation before trying again.',true,1000);}
function checkIdentity(c:PanelMutationContext,row:PanelOperationRecord,now:number):void {if(row.operation!==c.operation||row.bodyHash!==c.bodyHash||row.economyKey!==c.economyKey)throw new PanelApiError(409,'idempotency_conflict','That operation ID belongs to another command.');if(row.expiresAt<=now)throw new PanelApiError(409,'operation_expired','This operation needs reconciliation.');}
function saved(row:PanelOperationRecord):unknown {if(row.state==='failed'){const e=row.error;throw new PanelApiError(409,e?.code??'operation_failed',e?.message??'The operation could not be completed.',e?.retryable??false);}return row.result;}
export function createPanelJournal(deps:JournalDependencies){
 async function storeRecoveredResult(context:PanelMutationContext,result:unknown):Promise<unknown>{const restored=await deps.restore(context,result);await deps.storage.completeOperation(context,restored);return restored;}
 async function execute(context:PanelMutationContext,work:()=>Promise<unknown>):Promise<unknown>{
  if(!repositoryOperationNames[context.operation])throw new PanelApiError(400,'invalid_operation','This is not a mutation.');
  if(context.economyKey!==deriveEconomyKey(context.principal,context.operationId))throw new PanelApiError(400,'invalid_operation','Invalid operation identity.');
  context.nowMs=deps.now();let row=await deps.storage.readOperation(context.principal.serverId,context.principal.actorSteamId,context.operationId);
  if(row){checkIdentity(context,row,context.nowMs);if(row.state!=='pending')return saved(row);}else {assertExecutionAge(context);row=await deps.storage.admitOperation(context);checkIdentity(context,row,context.nowMs);if(row.state!=='pending')return saved(row);}
  row=await deps.storage.claimOperationLease(context);if(row.state!=='pending')return saved(row);
  try {
   const receipt=await deps.receipt(context);
   if(receipt?.status==='completed')return await storeRecoveredResult(context,receipt.result);
   if(receipt?.status==='manual_review'||(receipt?.status==='pending'&&context.operation!=='benefits.vip-activate'))throw uncertain();
   if(receipt?.status==='rejected')throw new PanelApiError(409,'operation_rejected','This operation was rejected.');
   assertExecutionAge(context,deps.now());
   const result=await work();await deps.storage.completeOperation(context,result);return result;
  }catch(error){
   // A provider or commit exception is never evidence that no economic work occurred.
   try {const receipt=await deps.receipt(context);if(receipt?.status==='completed'){try{return await storeRecoveredResult(context,receipt.result);}catch{throw uncertain();}}
    const terminal=error instanceof PanelApiError&&!error.retryable&&error.status<500&&error.code!=='operation_uncertain'&&receipt?.status!=='pending'&&receipt?.status!=='manual_review';
    const exposed=terminal?error:uncertain();await deps.storage.recordOperationError(context,errorData(exposed),terminal);throw exposed;
   }catch(recoveryError){if(recoveryError instanceof PanelApiError)throw recoveryError;throw uncertain();}
  }
 }
 async function status(principal:PanelPrincipal,targetOperationId:string):Promise<OperationStatus>{
  const created=operationCreatedAt(targetOperationId),now=deps.now(),row=await deps.storage.readOperation(principal.serverId,principal.actorSteamId,targetOperationId);
  if(!row||row.expiresAt<=now)return {status:now-created>86400000?'expired':'pending',result:null,error:null};
  if(!principal.allowedOperations.has(row.operation))throw new PanelApiError(403,'operation_forbidden','This server cannot inspect that operation.');
  if(row.state==='completed')return {status:'completed',result:row.result,error:null};if(row.state==='failed')return {status:'failed',result:null,error:row.error};
  const context:PanelMutationContext={principal,operation:row.operation,arguments:{},bodyHash:row.bodyHash,operationId:targetOperationId,economyKey:row.economyKey,nowMs:now};
  const receipt=await deps.receipt(context);
  if(receipt?.status==='completed'){try{return {status:'completed',result:await deps.restore(context,receipt.result),error:null};}catch{return {status:'pending',result:null,error:errorData(uncertain())};}}
  if(receipt?.status==='rejected')return {status:'failed',result:null,error:{code:'operation_rejected',message:'This operation was rejected.',retryable:false}};
  return {status:'pending',result:null,error:row.error};
 }
 return {execute,status,storeRecoveredResult};
}
