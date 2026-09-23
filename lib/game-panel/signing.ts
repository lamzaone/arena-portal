import { createHash, createHmac } from 'node:crypto';
export function hashPanelBody(body:Uint8Array):string {return createHash('sha256').update(body).digest('hex');}
export function canonicalPanelRequest(input:{serverId:string;keyId:string;path:string;bodyHash:string;actorSteamId:string;timestamp:string;requestId:string}):string {return ['panel-v1',input.serverId,input.keyId,'POST',input.path,input.bodyHash,input.actorSteamId,input.timestamp,input.requestId].join('\n');}
export function signPanelRequest(key:Uint8Array,canonical:string):string {return createHmac('sha256',key).update(canonical,'utf8').digest('hex');}
