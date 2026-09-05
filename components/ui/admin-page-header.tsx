import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";

import type { AdminAccess } from "@/lib/admin/access";

type AdminHeaderAccess = Pick<
  AdminAccess,
  "displayName" | "groups" | "immunity" | "isFounder"
>;

type AdminPageHeaderProps = {
  title: ReactNode;
  description: ReactNode;
  access?: AdminHeaderAccess;
  actions?: ReactNode;
  className?: string;
  id?: string;
};

function activeRole(access: AdminHeaderAccess) {
  if (access.isFounder) return "Founder";
  return access.groups.join(" + ") || "Staff";
}

export function AdminAccessSummary({ access }: { access: AdminHeaderAccess }) {
  return (
    <>
      <span><ShieldCheck aria-hidden="true" /> Active role</span>
      <strong>{activeRole(access)}</strong>
      <small>{access.displayName}<span title="Staff actions respect this immunity level">Immunity {access.immunity}</span></small>
    </>
  );
}

/**
 * Shared title area for every staff workspace.
 *
 * The legacy staff classes are intentionally retained as theme hooks: TAP GOD,
 * BETA TESTER, and future global themes can restyle the shell without each
 * admin route having to know which theme is active.
 */
export function AdminPageHeader({
  title,
  description,
  access,
  actions,
  className = "",
  id,
}: AdminPageHeaderProps) {
  return (
    <section
      className={`staff-hero admin-page-header ${className}`.trim()}
      data-ui="admin-page-header"
      aria-labelledby={id}
    >
      <div className="admin-page-header-copy">
        <p className="tapped-kicker"><ShieldCheck aria-hidden="true" /> Staff panel</p>
        <h1 id={id}>{title}</h1>
        <p>{description}</p>
      </div>
      {access || actions ? (
        <div
          className={`admin-page-header-side${access ? " has-summary" : ""}`}
        >
          {access ? (
            <aside className="staff-access-card admin-page-summary">
              <AdminAccessSummary access={access} />
            </aside>
          ) : null}
          {actions ? (
            <div className="admin-page-header-actions">{actions}</div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
