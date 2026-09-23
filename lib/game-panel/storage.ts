import { randomBytes } from 'node:crypto';
import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import type { PanelError, PanelOperation, PanelPrincipal, PanelArguments } from './contracts.ts';
import { PanelApiError } from './errors.ts';
import { operationCreatedAt } from './validation.ts';
export type PanelMutationContext = {principal:PanelPrincipal;operation:PanelOperation;arguments:PanelArguments[PanelOperation];bodyHash:string;operationId:string;economyKey:string;nowMs:number;leaseToken?:string};
export type PanelOperationRecord = {serverId:string;actorSteamId:string;operationId:string;operation:PanelOperation;bodyHash:string;economyKey:string;state:'pending'|'completed'|'failed';result:unknown|null;error:PanelError|null;expiresAt:number;leaseToken:string|null;leaseUntil:number|null};
export interface PanelStorage {
 claimTransport(input:{serverId:string;actorSteamId:string;requestId:string;mutation:boolean;nowMs:number}):Promise<void>;
 admitOperation(context:PanelMutationContext):Promise<PanelOperationRecord>;
 claimOperationLease(context:PanelMutationContext):Promise<PanelOperationRecord>;
 readOperation(serverId:string,actorSteamId:string,operationId:string):Promise<PanelOperationRecord|null>;
 completeOperation(context:PanelMutationContext,result:unknown):Promise<void>;
 recordOperationError(context:PanelMutationContext,error:PanelError,terminal:boolean):Promise<void>;
}
const unavailable = () => new PanelApiError(503,'storage_unavailable','Operation storage is temporarily unavailable.',true);
const identity=(c:PanelMutationContext)=>[c.principal.serverId,c.principal.actorSteamId,c.operationId];
function json(value:unknown):unknown {return typeof value==='string'?JSON.parse(value):value;}
function record(r:RowDataPacket):PanelOperationRecord {return {serverId:r.server_id,actorSteamId:r.actor_steam_id,operationId:r.operation_id,operation:r.operation_name,bodyHash:r.body_hash,economyKey:r.economy_key,state:r.state,result:json(r.result_json)??null,error:json(r.error_json) as PanelError|null,expiresAt:new Date(r.expires_at).getTime(),leaseToken:r.lease_token,leaseUntil:r.lease_until?new Date(r.lease_until).getTime():null};}
export function assertExecutionAge(context:PanelMutationContext,nowMs=context.nowMs):void {const age=nowMs-operationCreatedAt(context.operationId);if(age>86400000||age< -60000)throw new PanelApiError(409,'operation_expired','This operation needs reconciliation.');}
export class MysqlPanelStorage implements PanelStorage {
 constructor(private pool:Pool) {}
 private async transaction<T>(work:(connection:PoolConnection)=>Promise<T>):Promise<T> {
  let connection:PoolConnection|undefined;
  try {connection=await this.pool.getConnection();await connection.beginTransaction();const result=await work(connection);await connection.commit();return result;}catch(error){if(connection)await connection.rollback().catch(()=>{});if(error instanceof PanelApiError)throw error;throw unavailable();}finally{connection?.release();}
 }
 async claimTransport(input:{serverId:string;actorSteamId:string;requestId:string;mutation:boolean;nowMs:number}):Promise<void> {
  await this.transaction(async c=>{
   const minute=Math.floor(input.nowMs/60000);
   const caps:[string,number][]=[['all',600],[`r:${input.actorSteamId}`,60]];if(input.mutation)caps.push([`m:${input.actorSteamId}`,12]);
   for(const [subject,limit] of caps){
    await c.execute('INSERT INTO portal_game_panel_rate_windows (server_id,subject,window_started,request_count) VALUES (?,?,?,1) ON DUPLICATE KEY UPDATE request_count=request_count+1',[input.serverId,subject,minute]);
    const [rows]=await c.execute<RowDataPacket[]>('SELECT request_count FROM portal_game_panel_rate_windows WHERE server_id=? AND subject=? AND window_started=? FOR UPDATE',[input.serverId,subject,minute]);
    if(Number(rows[0]?.request_count)>limit)throw new PanelApiError(429,'rate_limited','Please wait before trying again.',true,60000-input.nowMs%60000);
   }
   try {await c.execute('INSERT INTO portal_game_panel_nonces (server_id,request_id,expires_at) VALUES (?,?,?)',[input.serverId,input.requestId,new Date(input.nowMs+600000)]);}catch(e){if((e as {code?:string}).code==='ER_DUP_ENTRY')throw new PanelApiError(409,'request_replayed','Use a fresh transport request ID.');throw e;}
   // Rotate the single bounded cleanup batch among indexed expiration tables.
   const cleanup=minute%3;
   if(cleanup===0)await c.execute('DELETE FROM portal_game_panel_nonces WHERE expires_at<? LIMIT 1000',[new Date(input.nowMs)]);
   else if(cleanup===1)await c.execute('DELETE FROM portal_game_panel_rate_windows WHERE window_started<? LIMIT 1000',[minute-2]);
   else await c.execute('DELETE FROM portal_game_panel_operations WHERE expires_at<? LIMIT 1000',[new Date(input.nowMs)]);
  });
 }
 async readOperation(serverId:string,actorSteamId:string,operationId:string):Promise<PanelOperationRecord|null>{try {const [rows]=await this.pool.execute<RowDataPacket[]>('SELECT * FROM portal_game_panel_operations WHERE server_id=? AND actor_steam_id=? AND operation_id=?',[serverId,actorSteamId,operationId]);return rows.length?record(rows[0]):null;}catch{throw unavailable();}}
 async admitOperation(context:PanelMutationContext):Promise<PanelOperationRecord>{
  return this.transaction(async c=>{
   // INSERT IGNORE resolves the first-writer race before the row lock and identity check.
   assertExecutionAge(context);
   await c.execute('INSERT IGNORE INTO portal_game_panel_operations (server_id,actor_steam_id,operation_id,operation_name,body_hash,economy_key,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?)',[...identity(context),context.operation,context.bodyHash,context.economyKey,new Date(context.nowMs),new Date(operationCreatedAt(context.operationId)+7*86400000)]);
   const [rows]=await c.execute<RowDataPacket[]>('SELECT * FROM portal_game_panel_operations WHERE server_id=? AND actor_steam_id=? AND operation_id=? FOR UPDATE',identity(context));
   if(!rows.length)throw unavailable();const row=record(rows[0]);this.check(context,row);return row;
  });
 }
 private check(context:PanelMutationContext,row:PanelOperationRecord):void {if(row.operation!==context.operation||row.bodyHash!==context.bodyHash||row.economyKey!==context.economyKey)throw new PanelApiError(409,'idempotency_conflict','That operation ID belongs to another command.');if(row.expiresAt<=context.nowMs)throw new PanelApiError(409,'operation_expired','This operation needs reconciliation.');}
 async claimOperationLease(context:PanelMutationContext):Promise<PanelOperationRecord>{return this.transaction(async c=>{
  const [rows]=await c.execute<RowDataPacket[]>('SELECT * FROM portal_game_panel_operations WHERE server_id=? AND actor_steam_id=? AND operation_id=? FOR UPDATE',identity(context));if(!rows.length)throw unavailable();const row=record(rows[0]);this.check(context,row);
  if(row.state!=='pending')return row;
  if(row.leaseUntil!==null&&row.leaseUntil>context.nowMs)throw new PanelApiError(409,'operation_pending','This operation is still pending.',true,1000);
  context.leaseToken=randomBytes(16).toString('hex');await c.execute('UPDATE portal_game_panel_operations SET lease_token=?,lease_until=? WHERE server_id=? AND actor_steam_id=? AND operation_id=?',[context.leaseToken,new Date(context.nowMs+30000),...identity(context)]);
  return {...row,leaseToken:context.leaseToken,leaseUntil:context.nowMs+30000};
 });}
 async completeOperation(context:PanelMutationContext,result:unknown):Promise<void>{await this.update(context,'completed',result,null);}
 async recordOperationError(context:PanelMutationContext,error:PanelError,terminal:boolean):Promise<void>{await this.update(context,terminal?'failed':'pending',null,error);}
 private async update(context:PanelMutationContext,state:string,result:unknown,error:PanelError|null):Promise<void>{try {const [updated]=await this.pool.execute<ResultSetHeader>('UPDATE portal_game_panel_operations SET state=?,result_json=?,error_json=?,lease_token=NULL,lease_until=NULL WHERE server_id=? AND actor_steam_id=? AND operation_id=? AND lease_token=? AND state=\'pending\'',[state,result===null?null:JSON.stringify(result),error===null?null:JSON.stringify(error),...identity(context),context.leaseToken??'']);if(updated.affectedRows!==1)throw new PanelApiError(409,'operation_uncertain','Check the operation status before retrying.',true);}catch(e){if(e instanceof PanelApiError)throw e;throw unavailable();}}
}
