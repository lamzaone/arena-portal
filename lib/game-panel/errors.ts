import type { PanelError } from './contracts.ts';
export class PanelApiError extends Error {
  constructor(public status:number, public code:string, message:string, public retryable=false, public retryAfterMs?:number) {super(message);this.name='PanelApiError';}
}
export function publicPanelError(error:unknown):PanelApiError {
  if(error instanceof PanelApiError) return error;
  return new PanelApiError(503,'service_unavailable','The service is temporarily unavailable.',true);
}
export function errorData(error:PanelApiError):PanelError {return {code:error.code,message:error.message,retryable:error.retryable,...(error.retryAfterMs === undefined ? {} : {retryAfterMs:error.retryAfterMs})};}
