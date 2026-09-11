import type { Metadata, MetadataRoute } from "next";

const SITE_ORIGIN = "https://tapped.ro";
const BRAND_IMAGE = {
  url: `${SITE_ORIGIN}/images/branding/tapped-emblem-512.png`,
  width: 512,
  height: 512,
  alt: "TAPPED.RO emblem",
};
const HOME_TITLE = "CS2 Arena Server Romania | TAPPED.RO";
const HOME_DESCRIPTION =
  "Join TAPPED.RO, a competitive CS2 arena server in Romania with ranked 1v1 fights, custom duels, monthly rewards, VIP perks, and player loadouts.";

const PUBLIC_ROUTES = ["/", "/modes", "/vip", "/ranking", "/market", "/staff"] as const;
const PRIVATE_ROUTES = [
  "/admin/",
  "/api/",
  "/players/",
  "/inventory",
  "/loadout",
  "/trades",
  "/settings",
  "/tickets",
  "/appeals",
] as const;
const PAGE_SEO = {
  "/staff": {
    title: "Meet the CS2 Arena Staff | TAPPED.RO",
    description:
      "Meet the people behind TAPPED.RO. Explore our CS2 arena staff, browse admin groups, and get to know the team keeping our community connected.",
  },
  "/modes": {
    title: "CS2 1v1 Arena Modes | TAPPED.RO",
    description:
      "Explore TAPPED.RO arena modes: ranked CS2 1v1 rounds, custom player duels, weapon formats, and competitive challenges hosted in Romania.",
  },
  "/vip": {
    title: "CS2 Arena VIP Benefits | TAPPED.RO",
    description:
      "Compare TAPPED.RO VIP tiers and benefits for the Romanian CS2 arena server, including free trials, cosmetics, loadouts, and player perks.",
  },
  "/ranking": {
    title: "CS2 Arena Rankings Romania | TAPPED.RO",
    description:
      "Follow the TAPPED.RO CS2 arena leaderboard, compare Romanian community rankings, and compete for monthly 1v1 rewards.",
  },
  "/market": {
    title: "CS2 Arena Market & Inventory | TAPPED.RO",
    description:
      "Browse the TAPPED.RO player market for crates, capsules, cosmetics, and VIP items earned on our CS2 arena server in Romania.",
  },
} as const;

export function canonicalUrl(pathname = "/") {
  return new URL(pathname, SITE_ORIGIN);
}

export function buildPublicSitemap() {
  return PUBLIC_ROUTES.map((pathname, index) => ({
    url: canonicalUrl(pathname).href,
    changeFrequency: index === 0 ? ("daily" as const) : ("weekly" as const),
    priority: index === 0 ? 1 : 0.8,
  })) satisfies MetadataRoute.Sitemap;
}

export function buildRobotsPolicy() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [...PRIVATE_ROUTES],
      },
    ],
    sitemap: canonicalUrl("/sitemap.xml").href,
    host: SITE_ORIGIN,
  } satisfies MetadataRoute.Robots;
}

export function buildHomeMetadata() {
  return {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    alternates: {
      canonical: "/",
    },
    openGraph: {
      type: "website",
      url: canonicalUrl("/").href,
      siteName: "TAPPED.RO",
      title: HOME_TITLE,
      description: HOME_DESCRIPTION,
      locale: "en_RO",
      images: [BRAND_IMAGE],
    },
    twitter: {
      card: "summary",
      images: [BRAND_IMAGE.url],
      title: HOME_TITLE,
      description: HOME_DESCRIPTION,
    },
    robots: {
      index: true,
      follow: true,
    },
  } satisfies Metadata;
}

export function buildPageMetadata(pathname: keyof typeof PAGE_SEO) {
  const page = PAGE_SEO[pathname];

  return {
    title: page.title,
    description: page.description,
    alternates: {
      canonical: pathname,
    },
    openGraph: {
      type: "website",
      url: canonicalUrl(pathname).href,
      siteName: "TAPPED.RO",
      title: page.title,
      description: page.description,
      locale: "en_RO",
      images: [BRAND_IMAGE],
    },
    twitter: {
      card: "summary",
      images: [BRAND_IMAGE.url],
      title: page.title,
      description: page.description,
    },
  } satisfies Metadata;
}

export const rootMetadata = {
  metadataBase: canonicalUrl("/"),
  applicationName: "TAPPED.RO",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48", type: "image/x-icon" },
      { url: "/images/branding/tapped-emblem.svg", sizes: "any", type: "image/svg+xml" },
    ],
    apple: [{ url: "/images/branding/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: { images: [BRAND_IMAGE] },
  twitter: { card: "summary", images: [BRAND_IMAGE.url] },
  verification: {
    google: "_ovwWYtmuGZdooqPWyzZZlt1ILhzVwd20R8F23ZKhuo",
  },
  title: "TAPPED.RO",
  description:
    "The TAPPED.RO player portal for Romania's Counter-Strike 2 arena community.",
  category: "games",
  referrer: "strict-origin-when-cross-origin",
} satisfies Metadata;

export function buildHomeStructuredData() {
  const websiteId = canonicalUrl("/#website").href;
  const organizationId = canonicalUrl("/#organization").href;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": websiteId,
        url: canonicalUrl("/").href,
        name: "TAPPED.RO",
        description: HOME_DESCRIPTION,
        inLanguage: "en",
        publisher: { "@id": organizationId },
      },
      {
        "@type": "Organization",
        "@id": organizationId,
        url: canonicalUrl("/").href,
        name: "TAPPED.RO",
        logo: {
          "@type": "ImageObject",
          url: BRAND_IMAGE.url,
          width: BRAND_IMAGE.width,
          height: BRAND_IMAGE.height,
        },
      },
      {
        "@type": "Service",
        "@id": canonicalUrl("/#cs2-arena-server").href,
        url: canonicalUrl("/").href,
        name: "TAPPED.RO CS2 Arena Server Romania",
        serviceType: "Counter-Strike 2 arena server",
        description: HOME_DESCRIPTION,
        provider: { "@id": organizationId },
        areaServed: {
          "@type": "Country",
          name: "Romania",
        },
      },
    ],
  };
}
