import type { Metadata } from "next";
import { Suspense } from "react";
import { CursorGridBackground } from "@/components/cursor-grid-background";
import {
  GlobalThemeBackground,
  GlobalThemeDocumentEffects,
} from "@/components/profile-theme-slots";
import { ProgressiveFormRuntime } from "@/components/ui/progressive-form-runtime";
import { NavigationProgress } from "@/components/ui/navigation-progress";
import { getSession } from "@/lib/auth/session";
import { rootMetadata } from "@/lib/seo/site";
import { resolvePortalThemeSurface } from "@/lib/themes/registry";
import "./globals.css";
import "./themes/default.css";
import "./themes/shared.css";
import "./themes/beta-tester.css";
import "./themes/tap-god.css";
import "./themes/ranks.css";
import "./themes/player-containers.css";
import "./staff-workspace.css";
import "./themes/refinements.css";
import "./themes/accessibility.css";
import "./form-runtime.css";
import "./navigation-progress.css";

export const metadata: Metadata = rootMetadata;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  const { surface: globalThemeSurface, theme: globalTheme } =
    resolvePortalThemeSurface(session?.profileThemeKey, "global");

  return (
    <html
      lang="en"
      className={globalThemeSurface.className}
      data-theme={globalTheme.key}
      data-theme-surface="global"
    >
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <GlobalThemeBackground themeKey={session?.profileThemeKey} />
        <GlobalThemeDocumentEffects themeKey={session?.profileThemeKey} />
        <CursorGridBackground />
        <ProgressiveFormRuntime />
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        <div id="main-content" className="portal-content" tabIndex={-1}>
          {children}
        </div>
      </body>
    </html>
  );
}
