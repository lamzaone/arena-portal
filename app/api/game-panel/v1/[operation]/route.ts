import { handlePanelRequest } from '@/lib/game-panel/handler';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request:Request,context:{params:Promise<{operation:string}>}):Promise<Response>{
 const {operation}=await context.params;
 return handlePanelRequest(request,operation);
}
