import { viewerResources, viewerResourceUrl, rewriteViewerResource, viewerRequestOrigin } from "@/lib/economy/viewer-resources";

export const runtime = "nodejs";
const types: Record<string,string> = {js:"application/javascript",css:"text/css",json:"application/json",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",avif:"image/avif",svg:"image/svg+xml",wasm:"application/wasm",woff:"font/woff",woff2:"font/woff2"};

export async function GET(request: Request, context: { params: Promise<{ provider: string; path: string[] }> }) {
  const { provider, path } = await context.params;
  const target = viewerResourceUrl(provider,path.join("/"));
  if (!target) return new Response(null,{status:404});
  try {
    const resource = await viewerResources().get(target);
    const extension = path.at(-1)!.split(".").at(-1)!;
    const bytes = extension === "js" || extension === "css"
      ? Buffer.from(rewriteViewerResource(resource.bytes.toString("utf8"),viewerRequestOrigin(request))) : resource.bytes;
    return new Response(new Uint8Array(bytes),{headers:{
      "Content-Type":types[extension] ?? "application/octet-stream",
      "Cache-Control":"public, max-age=86400, stale-while-revalidate=604800",
      "Access-Control-Allow-Origin":"*", "X-Content-Type-Options":"nosniff",
      "Content-Security-Policy":"sandbox; default-src 'none'", "Referrer-Policy":"no-referrer",
    }});
  } catch { return new Response(null,{status:503,headers:{"Cache-Control":"no-store","Access-Control-Allow-Origin":"*","Retry-After":"60"}}); }
}
