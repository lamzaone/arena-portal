import { timingSafeEqual } from 'node:crypto';
import { MUTATION_OPERATIONS, type PanelOperation, type PanelPrincipal } from './contracts.ts';
import type { PanelServer } from './config.ts';
import type { PanelStorage } from './storage.ts';
import { PanelApiError } from './errors.ts';
import { canonicalPanelRequest, hashPanelBody, signPanelRequest } from './signing.ts';
import { isPanelSteamId } from './validation.ts';
export type AuthDependencies = {now:()=>number;readConfiguration:()=>PanelServer[];storage:Pick<PanelStorage,'claimTransport'>};
function denied():never {throw new PanelApiError(401,'authentication_failed','Server authentication failed.');}
export async function authenticatePanelRequest(request:Request,operation:PanelOperation,deps:AuthDependencies):Promise<{principal:PanelPrincipal;body:Uint8Array}> {
  const url=new URL(request.url),path='/api/game-panel/v1/'+operation;
  if(request.method!=='POST'||url.pathname!==path||url.search||url.hash)denied();
  if(url.protocol!=='https:'&&!(process.env.NODE_ENV==='test'&&url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))denied();
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')??'')||request.headers.has('content-encoding'))throw new PanelApiError(400,'invalid_input','Send uncompressed UTF-8 JSON.');
  const serverId=request.headers.get('X-Panel-Server-Id')??'',keyId=request.headers.get('X-Panel-Key-Id')??'',actorSteamId=request.headers.get('X-Panel-Actor-Steam-Id')??'',timestamp=request.headers.get('X-Panel-Timestamp')??'',requestId=request.headers.get('X-Panel-Request-Id')??'',signature=request.headers.get('X-Panel-Signature')??'';
  if(!/^[a-z0-9_-]{1,64}$/.test(serverId)||!/^[a-z0-9_-]{1,64}$/.test(keyId)||!isPanelSteamId(actorSteamId)||! /^[0-9]{10}$/.test(timestamp)||! /^[a-f0-9]{32}$/.test(requestId)||! /^[a-f0-9]{64}$/.test(signature))denied();
  const now=deps.now();if(Math.abs(now-Number(timestamp)*1000)>60000)denied();
  const server=deps.readConfiguration().find(s=>s.serverId===serverId),key=server?.keys.find(k=>k.keyId===keyId&&now>=k.notBefore&&now<k.notAfter);if(!server||!key)denied();
  const length=request.headers.get('content-length');if(length&&(!/^\d+$/.test(length)||Number(length)>32768))throw new PanelApiError(413,'payload_too_large','Request exceeds the allowed size.');
  const reader=request.body?.getReader();if(!reader)denied();const chunks:Uint8Array[]=[];let size=0;
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>32768){await reader.cancel();throw new PanelApiError(413,'payload_too_large','Request exceeds the allowed size.');}chunks.push(value);}}finally{reader.releaseLock();}
  const body=Buffer.concat(chunks),expected=signPanelRequest(key.secret,canonicalPanelRequest({serverId,keyId,path,bodyHash:hashPanelBody(body),actorSteamId,timestamp,requestId}));
  if(!timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(expected,'hex')))denied();
  let parsed:unknown;try {parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));}catch{throw new PanelApiError(400,'invalid_input','Send valid UTF-8 JSON.');}
  if(!parsed||typeof parsed!=='object'||(parsed as {actorSteamId?:unknown}).actorSteamId!==actorSteamId)denied();
  if(!server.allowedOperations.has(operation))throw new PanelApiError(403,'operation_forbidden','This server cannot perform that operation.');
  await deps.storage.claimTransport({serverId,actorSteamId,requestId,mutation:MUTATION_OPERATIONS.has(operation),nowMs:now});
  return {principal:{serverId,keyId,actorSteamId,allowedOperations:server.allowedOperations},body};
}
