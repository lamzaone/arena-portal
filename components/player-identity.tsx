import Link from "next/link";
import type { ReactNode } from "react";

import { AdaptivePlayerHoverCard } from "@/components/adaptive-player-hover-card";
import { CopyToClipboardButton } from "@/components/copy-to-clipboard-button";
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
  /** Controls whether profile navigation lives on the identity, hover card, or neither. */
  profileLink?: "identity" | "hover-card" | "none";
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
  showSteamId = false,
  showBadges = variant === "table",
  hoverCard = true,
  profileLink = "identity",
}: PlayerIdentityProps) {
  const steamId = player.steamId.trim();
  const isPlayer = steamId64Pattern.test(steamId);
  const displayName = player.displayName.trim() || (isPlayer ? steamId : "System");
  const theme = getTrustedProfileTheme(player.profileThemeKey);
  const themeSurface = getTrustedProfileThemeSurface(
    player.profileThemeKey,
    "smallProfile",
  );
  const secondaryContent =
    secondary === undefined
      ? showSteamId && isPlayer
        ? steamId
        : null
      : secondary;
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
    variant === "table" ? "leaderboard-player" : undefined,
    styles.identity,
    className,
  ].filter(Boolean).join(" ");

  const copy = (
    <>
      <strong className={`player-identity-name ${styles.name}`}>{displayName}</strong>
      {variant === "inline" ? (
        showSteamId && isPlayer ? (
          <small className={`player-identity-secondary ${styles.inlineSteamId}`}>· {steamId}</small>
        ) : null
      ) : secondaryContent ? (
        <small className={`player-identity-secondary ${styles.secondary}`}>{secondaryContent}</small>
      ) : null}
      {showBadges && player.identityGroups.length ? (
        <span className={`player-identity-badges ${styles.badges}`}>
          <IdentityGroupBadgeList
            groups={player.identityGroups}
            compact
          />
        </span>
      ) : null}
    </>
  );
  const content = (
    <>
      {variant !== "inline" ? (
        <ResilientRemoteImage
          className={`player-identity-avatar ${styles.avatar}`}
          src={player.avatarUrl}
          alt=""
          referrerPolicy="no-referrer"
          fallback={
            <span className={`player-avatar-fallback player-identity-avatar-fallback ${styles.avatarFallback}`} aria-hidden="true">
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
      {isPlayer && profileLink === "identity" ? (
        <Link
          className={identityClassName}
          href={`/players/${steamId}`}
          aria-label={`Open ${displayName}'s player profile`}
        >
          {content}
        </Link>
      ) : (
        <StaticIdentity
          className={identityClassName}
          tabIndex={isPlayer && hoverCard && profileLink === "hover-card" ? 0 : undefined}
          aria-label={isPlayer && hoverCard && profileLink === "hover-card" ? `Preview ${displayName}'s player profile` : undefined}
        >
          {content}
        </StaticIdentity>
      )}
      {isPlayer && hoverCard && profileLink !== "none" ? (
        <AdaptivePlayerHoverCard
          className={`player-identity-hover-card ${styles.hoverCard}`}
          themeClassName={`leaderboard-player-row ${themeSurface?.className ?? "small-profile-theme-default"}`}
          themeKey={themeSurface ? theme.key : "default"}
          presence={player.presence}
          ariaLabel={`${displayName}'s player profile preview`}
        >
          <Link
            className={styles.hoverProfile}
            href={`/players/${steamId}`}
            aria-label={`Open ${displayName}'s player profile`}
          >
            <ResilientRemoteImage
              className={styles.hoverAvatar}
              src={player.avatarUrl}
              alt=""
              referrerPolicy="no-referrer"
              fallback={
                <span className={styles.hoverAvatarFallback} aria-hidden="true">
                  {avatarInitial(displayName)}
                </span>
              }
            />
            <span className={styles.hoverHeading}>
              <strong>{displayName}</strong>
              <ProfileThemeSurfaceBadge
                themeKey={player.profileThemeKey}
                surface="smallProfile"
              />
            </span>
          </Link>
          <span className={styles.hoverSteamRow}>
            <Link href={`/players/${steamId}`} className={styles.hoverSteamId}>
              {steamId}
            </Link>
            <CopyToClipboardButton
              value={steamId}
              label={`Copy ${displayName}'s SteamID64`}
            />
          </span>
          <span className={styles.hoverMeta}>
            <span className={styles.presence}>{presenceLabel(player.presence)}</span>
          </span>
          {player.identityGroups.length ? (
            <IdentityGroupBadgeList
              groups={player.identityGroups}
              compact
              label={`${displayName}'s player groups`}
            />
          ) : null}
        </AdaptivePlayerHoverCard>
      ) : null}
    </Frame>
  );
}
