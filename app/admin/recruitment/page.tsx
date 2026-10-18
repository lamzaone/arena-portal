import Link from "next/link";
import { ArrowUpRight, ClipboardList, Clock3, ShieldCheck, UsersRound } from "lucide-react";

import { formatPortalDate } from "@/components/formatters";
import { SignInRequired } from "@/components/sign-in-required";
import { StaffSubmenu } from "@/components/staff-submenu";
import { AdminPageHeader } from "@/components/ui/admin-page-header";
import { LinkPagination } from "@/components/ui/link-pagination";
import { PortalShell } from "@/components/ui/portal-shell";
import { getAdminAccess } from "@/lib/admin/access";
import { createAdminActionToken, getSession } from "@/lib/auth/session";
import { recruitmentMessage, staffRecruitmentRepository } from "@/lib/recruitment/service";

import styles from "./recruitment.module.css";

type SearchParams = { page?: string; error?: string; notice?: string };

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
    const [state, listing] = await Promise.all([repository.getState(), repository.getPage(Number(parameters.page ?? "1"))]);
    data = { state, listing };
  } catch {
    return <PortalShell authenticated className="staff-page" navigation={navigation}>{header}<section className={`panel ${styles.unavailable}`} role="status"><ClipboardList aria-hidden="true" /><h2>Recruitment is temporarily unavailable.</h2><p>Apply portal migration 041_staff_recruitment.sql, then try again.</p></section></PortalShell>;
  }
  const csrf = createAdminActionToken(session);
  const message = recruitmentMessage(parameters.error ?? parameters.notice);

  return <PortalShell authenticated className="staff-page" navigation={navigation}>
    {header}
    {message ? <p className={parameters.error ? styles.error : styles.notice} role={parameters.error ? "alert" : "status"}>{message}</p> : null}
    <section className={`panel ${styles.controls}`} aria-labelledby="recruitment-state-title">
      <div><p className="tapped-kicker"><UsersRound aria-hidden="true" />The next teammates</p><h2 id="recruitment-state-title">Recruitment is {data.state.open ? "open" : "closed"}.</h2><p>{data.state.open ? "Signed in players can submit applications from the Staff page." : "New applications are paused. Existing submissions remain available below."}</p></div>
      <div className={styles.controlActions}><form action="/api/admin/recruitment" method="post">
        <input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="action" value="set-open" /><input type="hidden" name="open" value={data.state.open ? "no" : "yes"} />
        <button type="submit" className="button button-primary" disabled={!csrf}>{data.state.open ? "Close recruitment" : "Open recruitment"}</button>
      </form><Link href="/staff#recruitment">View public section<ArrowUpRight aria-hidden="true" /></Link></div>
    </section>
    <section className={styles.applications} aria-labelledby="applications-title">
      <div className={styles.listHeading}><div><p className="tapped-kicker"><ClipboardList aria-hidden="true" />Submitted applications</p><h2 id="applications-title">Meet the applicants</h2></div><span>{data.listing.total} {data.listing.total === 1 ? "application" : "applications"}</span></div>
      {data.listing.applications.length ? data.listing.applications.map(application => {
        const active = application.status === "submitted" || application.status === "reviewing";
        const lowHours = application.playtimeSeconds !== null && application.playtimeSeconds < 108000;
        return <article className={`panel ${styles.application}`} key={application.id} aria-labelledby={`application-${application.id}`}>
          <div className={styles.applicationHeading}><div><h3 id={`application-${application.id}`}><Link href={`/players/${application.steamId}`}>{application.nickname}<ArrowUpRight aria-hidden="true" /></Link></h3><span>{application.steamId}</span></div><span className={styles.status} data-status={application.status}>{application.status}</span></div>
          <dl className={styles.facts}>
            <div><dt>Age</dt><dd>{application.age}</dd></div>
            <div><dt>Discord profile</dt><dd><a href={application.discordProfile} target="_blank" rel="noopener noreferrer">Open Discord<ArrowUpRight aria-hidden="true" /></a><small>{application.discordLinked ? "Verified Steam + Discord link" : "Not linked · player supplied"}</small></dd></div>
            <div><dt>Steam group</dt><dd>{application.steamGroupMember ? "Yes" : "No"}<small>Player supplied</small></dd></div>
            <div className={lowHours ? styles.lowHours : undefined}><dt>Server playtime</dt><dd>{application.playtimeSeconds === null ? "Unavailable" : `${(application.playtimeSeconds / 3600).toFixed(1)} hours`}{lowHours ? <small><Clock3 aria-hidden="true" />Below 30 hours</small> : null}</dd></div>
          </dl>
          <div className={styles.reason}><h4>About the applicant</h4><p>{application.reason}</p></div>
          <div className={styles.applicationFooter}><div><span>Submitted <time dateTime={new Date(application.createdAt).toISOString()}>{formatPortalDate(new Date(application.createdAt).toISOString())}</time></span>{application.reviewedAt && application.reviewedBy ? <span>Last reviewed <time dateTime={new Date(application.reviewedAt).toISOString()}>{formatPortalDate(new Date(application.reviewedAt).toISOString())}</time> by <Link href={`/players/${application.reviewedBy}`}>{application.reviewedBy}</Link></span> : null}</div>
            {active ? <form action="/api/admin/recruitment" method="post" className={styles.review}>
              <input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="action" value="review" /><input type="hidden" name="id" value={application.id} />
              <label htmlFor={`decision-${application.id}`}>Application status</label><select id={`decision-${application.id}`} name="status" defaultValue="reviewing"><option value="reviewing">Under review</option><option value="accepted">Accepted</option><option value="declined">Declined</option></select><button type="submit" disabled={!csrf}>Save status</button>
            </form> : null}
          </div>
        </article>;
      }) : <div className={`panel ${styles.empty}`}><ClipboardList aria-hidden="true" /><h3>No applications yet.</h3><p>Applications will appear here when recruitment opens.</p></div>}
      {data.listing.total > 25 ? <LinkPagination page={data.listing.page} totalPages={data.listing.pageCount} hrefForPage={page => `/admin/recruitment?page=${page}`} label="Recruitment application pages" /> : null}
      <p className={styles.note}>Accepting an application records your decision. Staff access is assigned separately in Groups &amp; access.</p>
    </section>
  </PortalShell>;
}
