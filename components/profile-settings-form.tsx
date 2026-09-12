"use client";

import {
  Globe2,
  Image as ImageIcon,
  LockKeyhole,
  Palette,
  Save,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState, useTransition } from "react";

import { PortalToast } from "@/components/success-toast";
import { AsyncButton } from "@/components/ui/async-button";
import { getTrustedProfileTheme } from "@/lib/content/profile-themes";
import { getPortalTheme } from "@/lib/themes/registry";

type InventoryVisibility = "private" | "public";

type OwnedTheme = {
  id: number;
  inventoryItemId: string;
  key: string;
  displayName: string;
  description: string;
  previewImageUrl: string | null;
  acquiredAt: string;
};

export type ProfileSettingsValue = {
  inventoryVisibility: InventoryVisibility;
  activeThemeId: number | null;
  activeThemeItemId: string | null;
  ownedThemes: OwnedTheme[];
};

type SettingsResponse = {
  ok?: boolean;
  message?: string;
  settings?: {
    inventoryVisibility: InventoryVisibility;
    activeThemeId: number | null;
    activeThemeItemId: string | null;
  };
};

type ProfileSettingsFormProps = {
  csrf: string;
  initialSettings: ProfileSettingsValue;
};

export function ProfileSettingsForm({
  csrf,
  initialSettings,
}: ProfileSettingsFormProps) {
  const router = useRouter();
  const [visibility, setVisibility] = useState(
    initialSettings.inventoryVisibility,
  );
  const [activeThemeItemId, setActiveThemeItemId] = useState<string | null>(
    initialSettings.activeThemeItemId,
  );
  const [saved, setSaved] = useState({
    visibility: initialSettings.inventoryVisibility,
    activeThemeItemId: initialSettings.activeThemeItemId,
  });
  const [notice, setNotice] = useState<{
    variant: "success" | "danger";
    message: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty =
    visibility !== saved.visibility ||
    activeThemeItemId !== saved.activeThemeItemId;
  const ownedThemeItemIds = useMemo(
    () =>
      new Set(initialSettings.ownedThemes.map((theme) => theme.inventoryItemId)),
    [initialSettings.ownedThemes],
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty || pending) return;
    setNotice(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/settings", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            csrf,
            inventoryVisibility: visibility,
            activeThemeItemId,
          }),
        });
        const result = (await response.json().catch(() => null)) as
          | SettingsResponse
          | null;
        if (!response.ok || !result?.ok || !result.settings) {
          throw new Error(
            result?.message ?? "Your settings could not be saved.",
          );
        }
        const selectedThemeItemId =
          result.settings.activeThemeItemId !== null &&
          ownedThemeItemIds.has(result.settings.activeThemeItemId)
            ? result.settings.activeThemeItemId
            : null;
        setVisibility(result.settings.inventoryVisibility);
        setActiveThemeItemId(selectedThemeItemId);
        setSaved({
          visibility: result.settings.inventoryVisibility,
          activeThemeItemId: selectedThemeItemId,
        });
        setNotice({
          variant: "success",
          message: result.message ?? "Your profile settings were saved.",
        });
        // Re-render server-owned profile surfaces from the committed account
        // settings without requiring a full-page reload.
        router.refresh();
      } catch (error) {
        setNotice({
          variant: "danger",
          message:
            error instanceof Error
              ? error.message
              : "Your settings could not be saved.",
        });
      }
    });
  }

  return (
    <form
      className="profile-settings-layout"
      onSubmit={submit}
      aria-busy={pending || undefined}
    >
      {notice ? (
        <PortalToast
          variant={notice.variant}
          message={notice.message}
          onDismiss={() => setNotice(null)}
        />
      ) : null}

      <fieldset className="panel settings-section" disabled={pending}>
        <legend>
          <span className="eyebrow">Inventory privacy</span>
          <strong>Choose who can browse your tradeable items.</strong>
        </legend>
        <p className="empty-copy" id="inventory-visibility-help">
          Control what other signed-in players can see when viewing your
          inventory or preparing a trade.
        </p>
        <div
          className="settings-choice-grid"
          aria-describedby="inventory-visibility-help"
        >
          <label
            className={`settings-choice${visibility === "private" ? " is-selected" : ""}`}
          >
            <input
              type="radio"
              name="inventoryVisibility"
              value="private"
              checked={visibility === "private"}
              onChange={() => setVisibility("private")}
            />
            <span className="settings-choice-icon">
              <LockKeyhole aria-hidden="true" />
            </span>
            <span>
              <strong>Private</strong>
              <small>Only you and authorised staff can browse it.</small>
            </span>
          </label>
          <label
            className={`settings-choice${visibility === "public" ? " is-selected" : ""}`}
          >
            <input
              type="radio"
              name="inventoryVisibility"
              value="public"
              checked={visibility === "public"}
              onChange={() => setVisibility("public")}
            />
            <span className="settings-choice-icon">
              <Globe2 aria-hidden="true" />
            </span>
            <span>
              <strong>Public for trading</strong>
              <small>Signed-in players can select available items in Trades.</small>
            </span>
          </label>
        </div>
      </fieldset>

      <fieldset className="panel settings-section" disabled={pending}>
        <legend>
          <span className="eyebrow">Site theme</span>
          <strong>Select a theme owned by your account.</strong>
        </legend>
        <p className="empty-copy">
          Choose your look across the website, your profile, and player cards.
          Membership rewards remain
          available while the granting membership is active.
        </p>
        <div className="settings-theme-grid">
          <label
            className={`settings-theme-card${activeThemeItemId === null ? " is-selected" : ""}`}
          >
            <input
              type="radio"
              name="activeThemeItemId"
              aria-label="ARENA default"
              value="default"
              checked={activeThemeItemId === null}
              onChange={() => setActiveThemeItemId(null)}
            />
            <span className="settings-theme-preview is-default">
              <Palette aria-hidden="true" />
              <span className="settings-theme-default-label">TAPPED.RO</span>
            </span>
            {activeThemeItemId === null ? <span className="settings-theme-selected">Selected</span> : null}
            <span className="settings-theme-copy">
              <strong>ARENA default</strong>
              <small>Dark steel, platinum type and the TAPPED.RO crimson edge.</small>
              <span className="settings-theme-surfaces"><span>Profile</span><span>Site UI</span><span>Player mentions</span><span>Player cards</span></span>
            </span>
          </label>
          {initialSettings.ownedThemes.map((theme) => {
            const trustedTheme = getTrustedProfileTheme(theme.key);
            const configuredTheme = getPortalTheme(theme.key);
            const themedSurfaces = [
              configuredTheme.surfaces.profile ? "Profile" : null,
              configuredTheme.surfaces.global ? "Site UI" : null,
              configuredTheme.surfaces.smallProfile
                ? "Player mentions"
                : null,
              configuredTheme.surfaces.playerContainer
                ? "Player cards"
                : null,
            ].filter(Boolean);

            return (
              <label
                className={`settings-theme-card${activeThemeItemId === theme.inventoryItemId ? " is-selected" : ""}`}
                key={theme.inventoryItemId}
              >
                <input
                  type="radio"
                  name="activeThemeItemId"
                  aria-label={theme.displayName}
                  value={theme.inventoryItemId}
                  checked={activeThemeItemId === theme.inventoryItemId}
                  onChange={() => setActiveThemeItemId(theme.inventoryItemId)}
                />
                <span className="settings-theme-preview">
                  {trustedTheme.previewImageUrl ? (
                    <Image
                      src={trustedTheme.previewImageUrl}
                      alt=""
                      width={800}
                      height={480}
                      sizes="(max-width: 640px) 100vw, (max-width: 1080px) 50vw, 33vw"
                    />
                  ) : (
                    <ImageIcon aria-hidden="true" />
                  )}
                </span>
                {activeThemeItemId === theme.inventoryItemId ? <span className="settings-theme-selected">Selected</span> : null}
                <span className="settings-theme-copy">
                  <strong>{theme.displayName}</strong>
                  <small>{configuredTheme.description ?? theme.description}</small>
                  {themedSurfaces.length ? (
                    <span className="settings-theme-surfaces" aria-label="Styles these areas">
                      {themedSurfaces.map((surface) => <span key={surface}>{surface}</span>)}
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
        {!initialSettings.ownedThemes.length ? (
          <p className="settings-owned-empty">
            Collect themes through memberships or the <Link href="/market">Market</Link> to personalise your profile.
          </p>
        ) : null}
      </fieldset>

      <footer className={`settings-save-bar${dirty || pending ? " has-changes" : ""}`}>
        <p role="status" aria-live="polite">
          {pending
            ? "Saving your settings…"
            : dirty
              ? "You have unsaved changes."
              : "All changes saved."}
        </p>
        <div className="settings-save-actions">
        {dirty ? <button className="button button-secondary" type="button" disabled={pending} onClick={() => { setVisibility(saved.visibility); setActiveThemeItemId(saved.activeThemeItemId); setNotice(null); }}>Discard changes</button> : null}
        <AsyncButton
          className="button button-primary"
          type="submit"
          disabled={!dirty}
          pending={pending}
          pendingLabel="Saving…"
          icon={<Save aria-hidden="true" />}
        >
          Save settings
        </AsyncButton>
        </div>
      </footer>
    </form>
  );
}
