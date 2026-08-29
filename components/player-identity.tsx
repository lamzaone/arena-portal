import Link from "next/link";
import type { ReactNode } from "react";

import { IdentityGroupBadgeList } from "@/components/identity-group-badge";
import { ProfileThemeSurfaceBadge } from "@/components/profile-theme-surface-badge";
import { ResilientRemoteImage } from "@/components/resilient-remote-image";
import {
  getTrustedProfileTheme,
  getTrustedProfileThemeSurface,
} from "@/lib/content/profile-themes";
import type { PlayerIdentityData } from "@/lib/player-identities";

import styles from "@/components/player-identity.module.css";

export type PlayerIdentityVariant = "inline" | "compact" | "table";

export type PlayerIdentityProps = {
  player: PlayerIdentityData;
  variant?: PlayerIdentityVariant;
  className?: string;
  secondary?: ReactNode;
  showSteamId?: boolean;
  showBadges?: boolean;
  hoverCard?: boolean;
};

const steamId64Pattern = /^7656119\d{10}$/;

function avatarInitial(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

function presenceLabel(presence: PlayerIdentityData["presence"]) {
  if (presence === "online") return "Steam online";
  if (presence === "offline") return "Steam offline";
  return "Steam status unavailable";
}

export function PlayerIdentity({
  player,
  variant = "compact",
  className = "",
  secondary,
  showSteamId = variant !== "inline",
  showBadges = variant === "table",
  hoverCard = true,
}: PlayerIdentityProps) {
  const steamId = player.steamId.trim();
  const isPlayer = steamId64Pattern.test(steamId);
  const displayName = player.displayName.trim() || (isPlayer ? steamId : "System");
  const theme = getTrustedProfileTheme(player.profileThemeKey);
  const themeSurface = getTrustedProfileThemeSurface(
    player.profileThemeKey,
    "smallProfile",
  );
  const secondaryContent = secondary === undefined ? steamId : secondary;
  const Frame = variant === "inline" ? "span" : "div";
  const StaticIdentity = variant === "inline" ? "span" : "div";
  const frameClassName = [
    "profile-object",
    styles.frame,
    styles[variant],
    themeSurface?.className,
  ].filter(Boolean).join(" ");
  const identityClassName = [
    "player-identity",
    `player-identity-${variant}`,
    styles.identity,
    className,
  ].filter(Boolean).join(" ");

  const copy = (
    <>
      <b className={styles.name}>{displayName}</b>
      {variant === "inline" ? (
        showSteamId && isPlayer ? (
          <small className={styles.inlineSteamId}>· {steamId}</small>
        ) : null
      ) : secondaryContent ? (
        <small className={styles.secondary}>{secondaryContent}</small>
      ) : null}
      {variant === "table" || (showBadges && player.identityGroups.length) ? (
        <span className={styles.badges}>
          {variant === "table" ? (
            <ProfileThemeSurfaceBadge
              themeKey={player.profileThemeKey}
              surface="smallProfile"
            />
          ) : null}
          {showBadges && player.identityGroups.length ? (
            <IdentityGroupBadgeList
              groups={player.identityGroups}
              compact
            />
          ) : null}
        </span>
      ) : null}
    </>
  );
  const content = (
    <>
      {variant !== "inline" ? (
        <ResilientRemoteImage
          className={styles.avatar}
          src={player.avatarUrl}
          alt=""
          referrerPolicy="no-referrer"
          fallback={
            <span className={styles.avatarFallback} aria-hidden="true">
              {avatarInitial(displayName)}
            </span>
          }
        />
      ) : null}
      {variant === "inline" ? (
        <span className={styles.copy}>{copy}</span>
      ) : (
        <div className={styles.copy}>{copy}</div>
      )}
    </>
  );

  return (
    <Frame
      className={frameClassName}
      data-player-identity-variant={variant}
      data-presence={player.presence}
      data-theme={themeSurface ? theme.key : undefined}
      data-theme-surface="small-profile"
      data-profile-theme={themeSurface ? theme.key : undefined}
    >
      {isPlayer ? (
        <Link
          className={identityClassName}
          href={`/players/${steamId}`}
          aria-label={`Open ${displayName}'s player profile`}
        >
          {content}
        </Link>
      ) : (
        <StaticIdentity className={identityClassName}>{content}</StaticIdentity>
      )}
      {isPlayer && hoverCard ? (
        <span className={styles.hoverCard} aria-hidden="true">
          <span className={styles.hoverHeading}>
            <strong>{displayName}</strong>
            <small>SteamID64 {steamId}</small>
          </span>
          <span className={styles.hoverMeta}>
            <span className={styles.presence}>{presenceLabel(player.presence)}</span>
            {themeSurface ? (
              <span className={styles.themeLabel}>{theme.displayName}</span>
            ) : null}
          </span>
          {player.identityGroups.length ? (
            <IdentityGroupBadgeList
              groups={player.identityGroups}
              compact
              label={`${displayName}'s player groups`}
            />
          ) : null}
        </span>
      ) : null}
    </Frame>
  );
}
