import type { MetadataRoute } from "next";

import { buildPublicSitemap } from "@/lib/seo/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return buildPublicSitemap();
}
