import type { ComponentPropsWithoutRef } from "react";

import { resolvePortalThemeSurface } from "@/lib/themes/registry";

type ThemedPlayerTableRowProps = ComponentPropsWithoutRef<"tr"> & {
  profileThemeKey?: string | null;
};

function classNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

/**
 * A table row whose presentation belongs to the player shown in it, not to
 * the signed-in viewer. Unknown, missing, and disabled surfaces resolve to the
 * source-controlled default theme.
 */
export function ThemedPlayerTableRow({
  profileThemeKey,
  className,
  ...rowProps
}: ThemedPlayerTableRowProps) {
  const { surface, theme } = resolvePortalThemeSurface(
    profileThemeKey,
    "smallProfile",
  );

  return (
    <tr
      {...rowProps}
      data-ui="player-table-row"
      className={classNames(
        "leaderboard-player-row",
        surface.className,
        className,
      )}
      data-theme={theme.key}
      data-theme-surface="small-profile"
    />
  );
}
