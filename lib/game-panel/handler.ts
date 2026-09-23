import {authenticatePanelRequest} from './authentication.ts';
import {readPanelConfiguration, type PanelServer} from './config.ts';
import {MUTATION_OPERATIONS,PANEL_OPERATIONS,type PanelArguments,type PanelOperation,type PanelPrincipal} from './contracts.ts';
import {PanelApiError,errorData,publicPanelError} from './errors.ts';
import {createPanelJournal,deriveEconomyKey,repositoryOperationNames,type JournalDependencies} from './journal.ts';
import {hashPanelBody} from './signing.ts';
import {MysqlPanelStorage,type PanelMutationContext,type PanelStorage} from './storage.ts';
import {parsePanelRequest} from './validation.ts';
export type HandlerDependencies = {
 now:()=>number;readConfiguration:()=>PanelServer[];storage:PanelStorage;
 read:(operation:PanelOperation,args:PanelArguments[PanelOperation],principal:PanelPrincipal)=>Promise<unknown>;
 mutate:(operation:PanelOperation,args:PanelArguments[PanelOperation],context:PanelMutationContext)=>Promise<unknown>;
 receipt:JournalDependencies['receipt'];restore:JournalDependencies['restore'];
};
function response(data:unknown,operationId:string|null,status=200,error?:ReturnType<typeof errorData>):Response {
 return Response.json({data,operationId,...(error?{error}:{})},{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
export function createPanelHandler(deps:HandlerDependencies):(request:Request,operation:string)=>Promise<Response>{
 const journal=createPanelJournal(deps);
 return async(request,operation)=>{
  let operationId:string|null=null;
  try {
   if(!PANEL_OPERATIONS.includes(operation as PanelOperation))throw new PanelApiError(404,'unknown_operation','Operation not found.');
   const op=operation as PanelOperation,{principal,body}=await authenticatePanelRequest(request,op,deps);
   const accepted=parsePanelRequest(op,JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body)));operationId=accepted.operationId;
   let result:unknown;
   if(op==='operations.status')result=await journal.status(principal,(accepted.arguments as PanelArguments['operations.status']).targetOperationId);
   else if(MUTATION_OPERATIONS.has(op)){
    const context:PanelMutationContext={principal,operation:op,arguments:accepted.arguments,bodyHash:hashPanelBody(body),operationId,economyKey:deriveEconomyKey(principal,operationId),nowMs:deps.now()};
    result=await journal.execute(context,()=>deps.mutate(op,accepted.arguments,context));
   }else result=await deps.read(op,accepted.arguments,principal);
   return response(result,operationId);
  }catch(error){const safe=publicPanelError(error);return response(null,operationId,safe.status,errorData(safe));}
 };
}
export async function handlePanelRequest(request:Request,operation:string):Promise<Response>{
 try {
  // Resolve pools inside the active Cloudflare/Next request scope, never at module load.
  const {getPortalDatabasePool}=await import('../data/database-pools');
  const pool=getPortalDatabasePool();if(!pool)throw new PanelApiError(503,'storage_unavailable','Operation storage is unavailable.',true);
  const storage=new MysqlPanelStorage(pool);
  return await createPanelHandler({now:Date.now,readConfiguration:readPanelConfiguration,storage,
   read:async(op,args,principal)=>(await import('./reads')).readPanelOperation(op,args,principal),
   mutate:async(op,args,context)=>(await import('./mutations')).mutatePanelOperation(op,args,context),
   receipt:async context=>{
    if(context.operation==='benefits.vip-activate')return (await import('../data/vip-membership-activation-saga')).getVipMembershipActivationStatus({steamId:context.principal.actorSteamId,idempotencyKey:context.economyKey});
    return (await import('../data/portal-repository')).getEconomyOperationReceipt({actorSteamId:context.principal.actorSteamId,idempotencyKey:context.economyKey,operationName:repositoryOperationNames[context.operation]!});
   },
   restore:async(context,raw)=>{
    if(raw!==null&&(typeof raw!=='object'||Array.isArray(raw)))throw new PanelApiError(503,'receipt_unavailable','The saved result is unavailable.',true);
    return (await import('./mutations')).restorePanelReceipt(context.operation,context.arguments,raw as Record<string,unknown>|null,context);
   },
  })(request,operation);
 }catch(error){const safe=publicPanelError(error);return response(null,null,safe.status,errorData(safe));}
}
