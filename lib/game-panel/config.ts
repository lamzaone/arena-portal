import { PANEL_OPERATIONS, type PanelOperation } from './contracts.ts';
import { PanelApiError } from './errors.ts';
export type PanelServer = {serverId:string;allowedOperations:ReadonlySet<PanelOperation>;keys:{keyId:string;secret:Uint8Array;notBefore:number;notAfter:number}[]};
function parseUtcDate(value:unknown):number {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value))throw Error();
 const time=Date.parse(value),normalized=value.length===20?value.slice(0,-1)+'.000Z':value;if(!Number.isFinite(time)||new Date(time).toISOString()!==normalized)throw Error();return time;
}
export function readPanelConfiguration(raw=process.env.GAME_PANEL_SERVERS_JSON):PanelServer[] {
  try {
    const servers:unknown=JSON.parse(raw??'');if(!Array.isArray(servers)||servers.length<1||servers.length>16)throw Error();
    const ids=new Set<string>();
    return servers.map((s)=>{
      if(!s||typeof s!=='object'||Object.keys(s).some(k=>!['serverId','allowedOperations','keys'].includes(k))||typeof s.serverId!=='string'||! /^[a-z0-9_-]{1,64}$/.test(s.serverId)||ids.has(s.serverId))throw Error();ids.add(s.serverId);
      if(!Array.isArray(s.allowedOperations)||!s.allowedOperations.length||s.allowedOperations.some((op:unknown)=>!PANEL_OPERATIONS.includes(op as PanelOperation))||new Set(s.allowedOperations).size!==s.allowedOperations.length)throw Error();
      if(!Array.isArray(s.keys)||s.keys.length<1||s.keys.length>2)throw Error();const keyIds=new Set<string>();
      const keys=s.keys.map((k:{keyId:string;secretBase64:string;notBefore:string;notAfter:string})=>{
        if(!k||Object.keys(k).some(x=>!['keyId','secretBase64','notBefore','notAfter'].includes(x))||typeof k.keyId!=='string'||!/^[a-z0-9_-]{1,64}$/.test(k.keyId)||keyIds.has(k.keyId)||typeof k.secretBase64!=='string')throw Error();keyIds.add(k.keyId);
        const secret=Buffer.from(k.secretBase64,'base64');if(secret.length<32||secret.length>128||secret.toString('base64')!==k.secretBase64)throw Error();
        const notBefore=parseUtcDate(k.notBefore),notAfter=parseUtcDate(k.notAfter);if(notAfter<=notBefore)throw Error();
        return {keyId:k.keyId,secret,notBefore,notAfter};
      });return {serverId:s.serverId,allowedOperations:new Set<PanelOperation>(s.allowedOperations),keys};
    });
  } catch {throw new PanelApiError(503,'panel_unconfigured','The game panel connection is unavailable.',true);}
}
