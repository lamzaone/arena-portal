import {
  ArrowLeftRight,
  Coins,
  Globe2,
  LoaderCircle,
  LockKeyhole,
  Palette,
} from "lucide-react";

import { ProfileShowcases } from "@/components/profile-showcases";
import { SiteHeader } from "@/components/site-header";
import {
  StaffSubmenu,
  type StaffSection,
} from "@/components/staff-submenu";
import { getAdminAccess } from "@/lib/admin/access";
import { getSession } from "@/lib/auth/session";

export type LoadingLayout =
  | "account"
  | "cards"
  | "catalogue"
  | "form"
  | "inventory"
  | "settings"
  | "split"
  | "status"
  | "table"
  | "trade";

type RouteLoadingProps = {
  eyebrow: string;
  title: string;
  description: string;
  layout?: LoadingLayout;
  staff?: boolean;
  staffSection?: StaffSection;
};

async function LoadingStaffSubmenu({ active }: { active: StaffSection }) {
  const session = await getSession();
  if (!session) return null;

  const access = await getAdminAccess(session.steamId);
  if (!access.isAdmin) return null;

  return <StaffSubmenu access={access} active={active} />;
}

function SkeletonCard({ featured = false }: { featured?: boolean }) {
  return (
    <article className={`ui-skeleton-card${featured ? " is-featured" : ""}`}>
      <span className="ui-skeleton ui-skeleton-media" />
      <span className="ui-skeleton ui-skeleton-label" />
      <span className="ui-skeleton ui-skeleton-title" />
      <span className="ui-skeleton ui-skeleton-line" />
      <span className="ui-skeleton ui-skeleton-line is-short" />
    </article>
  );
}

function TradeLoadingContent() {
  return (
    <>
      <div className="content-grid trade-intro-grid">
        <section className="panel">
          <p className="eyebrow">
            <ArrowLeftRight aria-hidden="true" /> Player trades
          </p>
          <h2>Build both sides of the offer.</h2>
          <p className="empty-copy">
            Find another player, select what you will give on the left and what
            you want on the right. Pending offers safely reserve only your own
            included assets.
          </p>
        </section>
        <section className="panel ui-loading-wallet" aria-hidden="true">
          <div>
            <Coins />
            <span className="ui-skeleton ui-skeleton-label" />
          </div>
          <span className="ui-skeleton ui-skeleton-title" />
          <span className="ui-skeleton ui-skeleton-line" />
        </section>
      </div>

      <section className="panel trade-builder ui-loading-trade-builder" aria-hidden="true">
        <div className="panel-heading trade-builder-heading">
          <div>
            <h2>Create trade offer</h2>
            <p>Search by a player&apos;s current name or exact SteamID64.</p>
          </div>
        </div>
        <span className="ui-skeleton ui-loading-trade-player-search" />
        <div className="trade-inventory-columns">
          {["You offer", "You request"].map((label) => (
            <section className="trade-side-panel" key={label}>
              <div className="ui-loading-trade-legend">
                <strong>{label}</strong>
                <small>0 / 12 selected</small>
              </div>
              <span className="ui-skeleton ui-loading-search" />
              <div className="trade-partner-loading">
                {Array.from({ length: 4 }, (_, index) => (
                  <span key={index} className="ui-skeleton-card">
                    <i className="ui-skeleton ui-skeleton-media" />
                    <i className="ui-skeleton ui-skeleton-title" />
                  </span>
                ))}
              </div>
            </section>
          ))}
        </div>
        <div className="trade-terms-grid ui-loading-trade-terms">
          <span className="ui-skeleton" />
          <span className="ui-skeleton" />
          <span className="ui-skeleton" />
          <span className="ui-skeleton" />
        </div>
      </section>

      <section className="history-section ui-loading-trade-history" aria-hidden="true">
        <div className="section-heading compact">
          <p className="eyebrow">Trade activity</p>
          <h2>Incoming and outgoing offers</h2>
        </div>
        <div className="history-grid">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </section>
    </>
  );
}

function SettingsLoadingContent() {
  return (
    <div className="profile-settings-layout">
      <fieldset className="panel settings-section" disabled>
        <legend>
          <span className="eyebrow">Inventory privacy</span>
          <strong>Choose who can browse your tradeable items.</strong>
        </legend>
        <p className="empty-copy">
          Staff tools remain protected separately. This controls what other
          signed-in players can see while preparing a trade.
        </p>
        <div className="settings-choice-grid" aria-hidden="true">
          {[
            [LockKeyhole, "Private", "Only you and authorised staff can browse it."],
            [Globe2, "Public for trading", "Signed-in players can select available items in Trades."],
          ].map(([Icon, title, copy]) => (
            <div className="settings-choice ui-loading-settings-choice" key={String(title)}>
              <span className="settings-choice-icon"><Icon /></span>
              <span><strong>{String(title)}</strong><small>{String(copy)}</small></span>
              <i className="ui-skeleton" />
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="panel settings-section" disabled>
        <legend>
          <span className="eyebrow">Profile theme</span>
          <strong>Select a theme owned by your account.</strong>
        </legend>
        <p className="empty-copy">
          Theme support can cover the profile, portal UI, and compact player
          mentions. Purchased themes appear here automatically.
        </p>
        <div className="settings-theme-grid" aria-hidden="true">
          <div className="settings-theme-card">
            <span className="settings-theme-preview is-default"><Palette /></span>
            <span><strong>ARENA default</strong><small>The original TAPPED.RO crimson profile.</small></span>
            <i className="ui-skeleton" />
          </div>
          {Array.from({ length: 2 }, (_, index) => (
            <div className="settings-theme-card ui-loading-theme-card" key={index}>
              <span className="ui-skeleton settings-theme-preview" />
              <span><i className="ui-skeleton" /><i className="ui-skeleton" /></span>
              <i className="ui-skeleton" />
            </div>
          ))}
        </div>
      </fieldset>

      <ProfileShowcases />
      <footer className="settings-save-bar" aria-hidden="true">
        <p>Loading saved choices.</p>
        <span className="ui-skeleton ui-loading-button" />
      </footer>
    </div>
  );
}

function LoadingContent({ layout }: { layout: LoadingLayout }) {
  if (layout === "trade") return <TradeLoadingContent />;
  if (layout === "settings") return <SettingsLoadingContent />;
  if (layout === "account") {
    return (
      <p className="ui-loading-inline" role="status">
        <LoaderCircle aria-hidden="true" /> Checking Steam session
      </p>
    );
  }

  if (layout === "status") {
    return (
      <aside className="ui-loading-live-status" aria-label="Loading live server status">
        <div><span>Server status</span><i className="ui-skeleton" /></div>
        <div><span>Players</span><i className="ui-skeleton" /></div>
        <div><span>Current map</span><i className="ui-skeleton" /></div>
      </aside>
    );
  }

  if (layout === "table") {
    return (
      <section className="ui-loading-panel ui-loading-table" aria-hidden="true">
        <div className="ui-loading-toolbar">
          <span className="ui-skeleton" />
          <span className="ui-skeleton" />
        </div>
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="ui-loading-row">
            <span className="ui-skeleton" />
            <span className="ui-skeleton" />
            <span className="ui-skeleton" />
            <span className="ui-skeleton" />
          </div>
        ))}
      </section>
    );
  }

  if (layout === "form") {
    return (
      <section className="ui-loading-panel ui-loading-form" aria-hidden="true">
        <span className="ui-skeleton ui-skeleton-title" />
        <div>
          {Array.from({ length: 4 }, (_, index) => (
            <span key={index} className="ui-skeleton" />
          ))}
        </div>
        <span className="ui-skeleton ui-loading-textarea" />
        <span className="ui-skeleton ui-loading-button" />
      </section>
    );
  }

  if (layout === "inventory" || layout === "split") {
    return (
      <div className={`ui-loading-split${layout === "inventory" ? " is-inventory" : ""}`} aria-hidden="true">
        <section className="ui-loading-panel ui-loading-sidebar">
          <span className="ui-skeleton ui-skeleton-title" />
          <span className="ui-skeleton ui-loading-search" />
          {Array.from({ length: 5 }, (_, index) => (
            <span key={index} className="ui-skeleton ui-loading-list-item" />
          ))}
        </section>
        <section className="ui-loading-card-grid">
          {Array.from({ length: 6 }, (_, index) => (
            <SkeletonCard key={index} featured={index === 0} />
          ))}
        </section>
      </div>
    );
  }

  return (
    <section
      className={`ui-loading-card-grid${layout === "catalogue" ? " is-catalogue" : ""}`}
      aria-hidden="true"
    >
      {Array.from({ length: layout === "catalogue" ? 8 : 4 }, (_, index) => (
        <SkeletonCard key={index} featured={layout === "cards" && index === 0} />
      ))}
    </section>
  );
}

export function RouteLoading({
  eyebrow,
  title,
  description,
  layout = "cards",
  staff = false,
  staffSection = "bans",
}: RouteLoadingProps) {
  return (
    <main
      data-ui="route-loading"
      className={`tapped-page portal-route-loading${staff ? " staff-page" : ""}`}
      aria-busy="true"
    >
      <div className="shell">
        <SiteHeader authenticated />
        <section className="page-heading ui-loading-page-heading">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          <span className="ui-loading-status" role="status" aria-live="polite">
            <LoaderCircle aria-hidden="true" /> Loading content
          </span>
        </section>
        {staff ? <LoadingStaffSubmenu active={staffSection} /> : null}
        <LoadingContent layout={layout} />
      </div>
    </main>
  );
}
