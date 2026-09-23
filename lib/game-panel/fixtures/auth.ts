import {readPanelConfiguration} from '../config.ts';
import {canonicalPanelRequest,hashPanelBody,signPanelRequest} from '../signing.ts';
const now=1790164800000,key=Buffer.alloc(32,7),actor='76561198000000001';
export const syntheticConfiguration = () => readPanelConfiguration(JSON.stringify([{serverId:'arena-test',allowedOperations:['wallet.read','inventory.protect'],keys:[{keyId:'a',secretBase64:key.toString('base64'),notBefore:'2026-01-01T00:00:00Z',notAfter:'2027-01-01T00:00:00Z'}]}]));
export function signedRequest(path='/api/game-panel/v1/wallet.read',body=JSON.stringify({actorSteamId:actor,operationId:`${now}_00112233445566778899aabbccddeeff`,arguments:{}}),requestId='11112222333344445555666677778888') {
 const fields={serverId:'arena-test',keyId:'a',path,bodyHash:hashPanelBody(Buffer.from(body)),actorSteamId:actor,timestamp:String(now/1000),requestId};
 return new Request('https://portal.test'+path,{method:'POST',headers:{'content-type':'application/json','X-Panel-Server-Id':fields.serverId,'X-Panel-Key-Id':fields.keyId,'X-Panel-Actor-Steam-Id':actor,'X-Panel-Timestamp':fields.timestamp,'X-Panel-Request-Id':requestId,'X-Panel-Signature':signPanelRequest(key,canonicalPanelRequest(fields))},body});
}
