"use client";

import {
  Globe2,
  Image as ImageIcon,
  LockKeyhole,
  Palette,
  Save,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState, useTransition } from "react";

import { PortalToast } from "@/components/success-toast";
import { ProfileShowcases } from "@/components/profile-showcases";
import { AsyncButton } from "@/components/ui/async-button";

type InventoryVisibility = "private" | "public";

type OwnedTheme = {
  id: number;
  key: string;
  displayName: string;
  description: string;
  previewImageUrl: string | null;
  acquiredAt: string;
};

export type ProfileSettingsValue = {
  inventoryVisibility: InventoryVisibility;
  activeThemeId: number | null;
  ownedThemes: OwnedTheme[];
};

type SettingsResponse = {
  ok?: boolean;
  message?: string;
  settings?: {
    inventoryVisibility: InventoryVisibility;
    activeThemeId: number | null;
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
  const [activeThemeId, setActiveThemeId] = useState<number | null>(
    initialSettings.activeThemeId,
  );
  const [saved, setSaved] = useState({
    visibility: initialSettings.inventoryVisibility,
    activeThemeId: initialSettings.activeThemeId,
  });
  const [notice, setNotice] = useState<{
    variant: "success" | "danger";
    message: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty =
    visibility !== saved.visibility || activeThemeId !== saved.activeThemeId;
  const ownedThemeIds = useMemo(
    () => new Set(initialSettings.ownedThemes.map((theme) => theme.id)),
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
            activeThemeId,
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
        const selectedThemeId =
          result.settings.activeThemeId !== null &&
          ownedThemeIds.has(result.settings.activeThemeId)
            ? result.settings.activeThemeId
            : null;
        setVisibility(result.settings.inventoryVisibility);
        setActiveThemeId(selectedThemeId);
        setSaved({
          visibility: result.settings.inventoryVisibility,
          activeThemeId: selectedThemeId,
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
          Staff tools remain protected separately. This controls what other
          signed-in players can see while preparing a trade.
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
          <span className="eyebrow">Profile theme</span>
          <strong>Select a theme owned by your account.</strong>
        </legend>
        <p className="empty-copy">
          Themes change profile presentation only. Purchased themes will
          appear here automatically when profile-theme products launch.
        </p>
        <div className="settings-theme-grid">
          <label
            className={`settings-theme-card${activeThemeId === null ? " is-selected" : ""}`}
          >
            <input
              type="radio"
              name="activeThemeId"
              value="default"
              checked={activeThemeId === null}
              onChange={() => setActiveThemeId(null)}
            />
            <span className="settings-theme-preview is-default">
              <Palette aria-hidden="true" />
            </span>
            <span>
              <strong>ARENA default</strong>
              <small>The original TAPPED.RO crimson profile.</small>
            </span>
          </label>
          {initialSettings.ownedThemes.map((theme) => (
            <label
              className={`settings-theme-card${activeThemeId === theme.id ? " is-selected" : ""}`}
              key={theme.id}
            >
              <input
                type="radio"
                name="activeThemeId"
                value={theme.id}
                checked={activeThemeId === theme.id}
                onChange={() => setActiveThemeId(theme.id)}
              />
              <span className="settings-theme-preview">
                <ImageIcon aria-hidden="true" />
              </span>
              <span>
                <strong>{theme.displayName}</strong>
                <small>{theme.description}</small>
              </span>
            </label>
          ))}
        </div>
        {!initialSettings.ownedThemes.length ? (
          <p className="settings-owned-empty">
            No additional profile themes are owned yet. Nothing needs to load
            here until themes become available.
          </p>
        ) : null}
      </fieldset>

      <ProfileShowcases />

      <footer className="settings-save-bar">
        <p role="status" aria-live="polite">
          {pending
            ? "Saving your settings…"
            : dirty
              ? "You have unsaved changes."
              : "All changes saved."}
        </p>
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
      </footer>
    </form>
  );
}
