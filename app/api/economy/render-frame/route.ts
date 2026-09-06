import { viewerResources, VIEWER_TEMPLATE_URL, rewriteViewerResource, viewerFramePolicy, viewerRequestOrigin } from "@/lib/economy/viewer-resources";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const origin = viewerRequestOrigin(request);
    const resource = await viewerResources().get(VIEWER_TEMPLATE_URL);
    const template = rewriteViewerResource(resource.bytes.toString("utf8"),origin);
    if (!template.includes("<head>")) throw new Error("Viewer template changed");
    // The item travels in the fragment and stays in the browser. This document
    // and its public assets are identical for every visitor and contain no session.
    const html = template.replace("<head>",'<head><script src="/scripts/weapon-render-bridge.js"></script>');
    return new Response(html,{headers:{
      "Content-Type":"text/html; charset=utf-8", "Cache-Control":"public, max-age=3600",
      "Content-Security-Policy":viewerFramePolicy(origin), "X-Frame-Options":"SAMEORIGIN",
      "Referrer-Policy":"no-referrer", "X-Content-Type-Options":"nosniff",
    }});
  } catch { return new Response("Viewer temporarily unavailable",{status:503,headers:{"Cache-Control":"no-store","Content-Security-Policy":"sandbox; default-src 'none'"}}); }
}
