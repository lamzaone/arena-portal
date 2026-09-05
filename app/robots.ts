import type { MetadataRoute } from "next";

import { buildRobotsPolicy } from "@/lib/seo/site";

export default function robots(): MetadataRoute.Robots {
  return buildRobotsPolicy();
}
