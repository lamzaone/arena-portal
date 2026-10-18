import Link from "next/link";
import { ArrowUpRight, Check, ChevronDown, ClipboardList, MessageSquare, Search, ShieldCheck, SlidersHorizontal, TriangleAlert, UsersRound } from "lucide-react";

import { formatPortalDate } from "@/components/formatters";
import { SignInRequired } from "@/components/sign-in-required";
import { StaffSubmenu } from "@/components/staff-submenu";
import { AdminPageHeader } from "@/components/ui/admin-page-header";
import { LinkPagination } from "@/components/ui/link-pagination";
import { PortalShell } from "@/components/ui/portal-shell";
import { getAdminAccess } from "@/lib/admin/access";
import { createAdminActionToken, getSession } from "@/lib/auth/session";
import { recruitmentMessage, staffRecruitmentRepository } from "@/lib/recruitment/service";
import { evaluateRecruitmentRequirements } from "@/lib/recruitment/requirements";

import styles from "./recruitment.module.css";

type SearchParams = { page?: string; name?: string; status?: string; error?: string; notice?: string };
const statusLabels = { submitted: "Submitted", reviewing: "Under review", accepted: "Accepted", declined: "Declined" };

export default async function RecruitmentPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await getSession();
  if (!session) return <SignInRequired title="Staff recruitment" description="Sign in with Steam to review staff applications." />;
  const actor = await getAdminAccess(session.steamId);
  if (!actor.isAdmin) return <PortalShell authenticated className="staff-page"><section className="staff-denied"><ShieldCheck aria-hidden="true" /><p className="tapped-kicker">Restricted area</p><h1>Staff access required.</h1><p>An active staff assignment is required to view applications.</p></section></PortalShell>;
  const parameters = await searchParams;
  const navigation = <StaffSubmenu access={actor} active="recruitment" />;
  const header = <AdminPageHeader title="Staff recruitment" description="Open the next round of recruitment and review every application in one place." access={actor} />;
  let data;
  try {
    const repository = staffRecruitmentRepository();
    const [state, listing] = await Promise.all([repository.getState(), repository.getPage(Number(parameters.page ?? "1"), { name: parameters.name, status: parameters.status })]);
    data = { state, listing };
  } catch {
    return <PortalShell authenticated className="staff-page" navigation={navigation}>{header}<section className={`panel ${styles.unavailable}`} role="status"><ClipboardList aria-hidden="true" /><h2>Recruitment is temporarily unavailable.</h2><p>Please try again shortly.</p></section></PortalShell>;
  }
  const csrf = createAdminActionToken(session);
  const message = recruitmentMessage(parameters.error ?? parameters.notice);
  const filters = data.listing.filters;
  const filtered = Boolean(filters.name || filters.status !== "all");
  function listingHref(page: number) {
    const query = new URLSearchParams();
    if (filters.name) query.set("name", filters.name);
    if (filters.status !== "all") query.set("status", filters.status);
    if (page > 1) query.set("page", String(page));
    return `/admin/recruitment${query.size ? `?${query}` : ""}`;
  }

  return <PortalShell authenticated className="staff-page" navigation={navigation}>
    {header}
    {message ? <p className={parameters.error ? styles.error : styles.notice} role={parameters.error ? "alert" : "status"}>{message}</p> : null}
    <section className={`panel ${styles.controls}`} aria-labelledby="recruitment-state-title">
      <div><p className="tapped-kicker"><UsersRound aria-hidden="true" />The next teammates</p><h2 id="recruitment-state-title">Recruitment is {data.state.open ? "open" : "closed"}.</h2><p>{data.state.open ? "Signed in players can submit applications from the Staff page." : "New applications are paused. Existing submissions remain available below."}</p></div>
      <div className={styles.controlActions}><form action="/api/admin/recruitment" method="post">
        <input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="action" value="set-open" /><input type="hidden" name="open" value={data.state.open ? "no" : "yes"} />
        <input type="hidden" name="returnName" value={filters.name} /><input type="hidden" name="returnStatus" value={filters.status} /><input type="hidden" name="returnPage" value={data.listing.page} />
        <button type="submit" className="button button-primary" disabled={!csrf}>{data.state.open ? "Close recruitment" : "Open recruitment"}</button>
      </form><Link href="/staff#recruitment">View public section<ArrowUpRight aria-hidden="true" /></Link></div>
    </section>
    <section className={styles.applications} aria-labelledby="applications-title">
      <div className={styles.listHeading}><div><p className="tapped-kicker"><ClipboardList aria-hidden="true" />Submitted applications</p><h2 id="applications-title">Meet the applicants</h2></div><span>{data.listing.total} {data.listing.total === 1 ? "application" : "applications"}</span></div>
      <form action="/admin/recruitment" method="get" className={styles.filters} aria-label="Filter staff applications">
        <label className={styles.nameFilter} htmlFor="recruitment-name"><span><Search aria-hidden="true" />Player name</span><input id="recruitment-name" type="search" name="name" defaultValue={filters.name} maxLength={128} placeholder="Search all applicants…" /></label>
        <label htmlFor="recruitment-status"><span><SlidersHorizontal aria-hidden="true" />Application status</span><select id="recruitment-status" name="status" defaultValue={filters.status}><option value="all">All statuses</option>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <div className={styles.filterActions}><button type="submit" className="button button-primary">Filter applications</button>{filtered ? <Link href="/admin/recruitment">Clear filters</Link> : null}</div>
      </form>
      {data.listing.applications.length ? data.listing.applications.map(application => {
        const active = application.status === "submitted" || application.status === "reviewing";
        const requirements = evaluateRecruitmentRequirements({ age: application.age, playtimeSeconds: application.playtimeSeconds, discordLinked: application.discordLinked, steamGroupMember: application.steamGroupMember });
        return <details className={`panel ${styles.application}`} data-ui="recruitment-application" key={application.id}>
          <summary className={styles.applicationSummary}><span>{application.nickname}</span><ChevronDown aria-hidden="true" /></summary>
          <div className={styles.applicationBody}>
          <div className={styles.applicationHeading}><div><Link href={`/players/${application.steamId}`}>View player profile<ArrowUpRight aria-hidden="true" /></Link><span>{application.steamId}</span></div><span className={styles.status} data-status={application.status}>{statusLabels[application.status]}</span></div>
          <dl className={styles.facts}>
            <div><dt>Age</dt><dd>{application.age}</dd></div>
            <div><dt>Discord profile</dt><dd><a href={application.discordProfile} target="_blank" rel="noopener noreferrer">Open Discord<ArrowUpRight aria-hidden="true" /></a><small>{application.discordLinked ? "Verified Steam + Discord link" : "Not linked · player supplied"}</small></dd></div>
            <div><dt>Steam group</dt><dd>{application.steamGroupMember ? "Yes" : "No"}<small>Player supplied</small></dd></div>
            <div><dt>Server playtime</dt><dd>{application.playtimeSeconds === null ? "Unavailable" : `${(application.playtimeSeconds / 3600).toFixed(1)} hours`}</dd></div>
          </dl>
          <section className={styles.requirements} aria-label="Application baseline requirements"><div className={styles.requirementsHeading}><h3>Baseline requirements</h3><span>At submission</span></div><ul>{requirements.criteria.map(criterion => <li key={criterion.key} data-state={criterion.state}>{criterion.state === "met" ? <Check aria-hidden="true" /> : <TriangleAlert aria-hidden="true" />}<div><strong>{criterion.label}</strong><span>{criterion.detail}</span></div></li>)}</ul>{requirements.requiresAttention ? <p className={styles.requirementsWarning}>Not all baseline requirements are met or verified. Applicants who do not meet every criterion have a lower chance of acceptance, but can still apply.</p> : null}</section>
          <div className={styles.reason}><h4>About the applicant</h4><p>{application.reason}</p></div>
          <form action="/api/admin/recruitment" method="post" className={styles.review}>
              <input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="action" value="review" /><input type="hidden" name="id" value={application.id} />
              <input type="hidden" name="returnName" value={filters.name} /><input type="hidden" name="returnStatus" value={filters.status} /><input type="hidden" name="returnPage" value={data.listing.page} />
              <label className={styles.responseLabel} htmlFor={`response-${application.id}`}><span><MessageSquare aria-hidden="true" />Admin response</span><textarea id={`response-${application.id}`} name="response" rows={4} maxLength={2000} defaultValue={application.adminResponse ?? ""} placeholder="Leave feedback or explain your decision…" /><small>Optional. Visible to the applicant and staff. Up to 2,000 characters.</small></label>
              <div className={styles.reviewActions}>{active ? <label htmlFor={`decision-${application.id}`}><span>Application status</span><select id={`decision-${application.id}`} name="status" defaultValue="reviewing"><option value="reviewing">Under review</option><option value="accepted">Accepted</option><option value="declined">Declined</option></select></label> : <><input type="hidden" name="status" value={application.status} /><p>This decision is final. You can update the response.</p></>}<button type="submit" className="button button-primary" disabled={!csrf}>{active ? "Save review" : "Save response"}</button></div>
          </form>
          <div className={styles.applicationFooter}><span>Submitted <time dateTime={new Date(application.createdAt).toISOString()}>{formatPortalDate(new Date(application.createdAt).toISOString())}</time></span>{application.reviewedAt && application.reviewedBy ? <span>Last reviewed <time dateTime={new Date(application.reviewedAt).toISOString()}>{formatPortalDate(new Date(application.reviewedAt).toISOString())}</time> by <Link href={`/players/${application.reviewedBy}`}>{application.reviewedBy}</Link></span> : null}</div>
          </div>
        </details>;
      }) : <div className={`panel ${styles.empty}`}><ClipboardList aria-hidden="true" /><h3>{filtered ? "No matching applications." : "No applications yet."}</h3><p>{filtered ? "Try another name or status to find an applicant." : "Applications will appear here when recruitment opens."}</p>{filtered ? <Link href="/admin/recruitment">Clear filters<ArrowUpRight aria-hidden="true" /></Link> : null}</div>}
      {data.listing.pageCount > 1 ? <LinkPagination page={data.listing.page} totalPages={data.listing.pageCount} hrefForPage={listingHref} label="Recruitment application pages" /> : null}
      <p className={styles.note}>Accepting an application records your decision. Staff access is assigned separately in Groups &amp; access.</p>
    </section>
  </PortalShell>;
}
