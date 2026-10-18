import Link from "next/link";
import { ArrowRight, BadgeCheck, ClipboardList, MessageSquareText, ShieldCheck, UsersRound } from "lucide-react";

import { getAdminAccess } from "@/lib/admin/access";
import { createAdminActionToken, createProfileActionToken, type PortalSession } from "@/lib/auth/session";
import { formatPortalDate } from "@/components/formatters";
import { getRecruitmentPlayer, recruitmentMessage, staffRecruitmentRepository } from "@/lib/recruitment/service";
import { RECRUITMENT_MINIMUM_AGE, RECRUITMENT_MINIMUM_PLAYTIME_SECONDS } from "@/lib/recruitment/requirements";
import { RecruitmentApplicationForm } from "./recruitment-application-form";

import styles from "./recruitment.module.css";

export type RecruitmentSearchParams = { notice?: string; error?: string };

export async function RecruitmentSection({ session, parameters }: { session: PortalSession | null; parameters: RecruitmentSearchParams }) {
  const actor = session ? await getAdminAccess(session.steamId).catch(() => null) : null;
  let data;
  try {
    const repository = staffRecruitmentRepository();
    const [state, latest] = await Promise.all([repository.getState(), session ? repository.getOwnLatest(session.steamId) : null]);
    const ownLatest = session && latest?.steamId === session.steamId ? latest : null;
    const active = ownLatest && ["submitted", "reviewing"].includes(ownLatest.status);
    const player = state.open && session && !active ? await getRecruitmentPlayer(session.steamId) : null;
    data = { state, latest: ownLatest, active, player };
  } catch { /* Keep the public directory usable if the recruitment migration is pending. */ }
  const open = Boolean(data?.state.open);
  const csrf = session ? createProfileActionToken(session) : "";
  const message = recruitmentMessage(parameters.error ?? parameters.notice);

  return <section id="recruitment" className={styles.recruitment} aria-labelledby="recruitment-title">
    <div className={styles.heading}>
      <div className={styles.title}>
        <span className={styles.emblem}><UsersRound aria-hidden="true" /></span>
        <div><p className={styles.eyebrow}>BUILD THE NEXT ROUND</p><h2 id="recruitment-title">A place on the team.</h2></div>
      </div>
      <span className={styles.status} data-open={open}><i aria-hidden="true" />{!data ? "Temporarily unavailable" : open ? "Recruitment open" : "Recruitment closed"}</span>
    </div>
    <p className={styles.intro}>{open ? "Care about fair play and a welcoming community? Tell us a little about yourself." : "We’re not accepting staff applications right now. Check back here for the next opening."}</p>
    <div className={styles.baselineSummary}><ShieldCheck aria-hidden="true" /><p>Our baseline: <strong>age {RECRUITMENT_MINIMUM_AGE}+, {RECRUITMENT_MINIMUM_PLAYTIME_SECONDS / 3600}+ server hours, verified Steam + Discord link, and Steam group membership.</strong> Applications that do not meet these criteria may have a lower chance of acceptance. You can still apply.</p></div>
    {message ? <p className={parameters.error ? styles.error : styles.notice} role={parameters.error ? "alert" : "status"}>{message}</p> : null}
    {actor?.isAdmin && session ? <div className={styles.staffControls}>
      <Link href="/admin/recruitment"><ClipboardList aria-hidden="true" />Review applications<ArrowRight aria-hidden="true" /></Link>
      {data ? <form action="/api/admin/recruitment" method="post">
        <input type="hidden" name="csrf" value={createAdminActionToken(session)} />
        <input type="hidden" name="action" value="set-open" /><input type="hidden" name="open" value={open ? "no" : "yes"} /><input type="hidden" name="returnTo" value="/staff" />
        <button type="submit"><ShieldCheck aria-hidden="true" />{open ? "Close recruitment" : "Open recruitment"}</button>
      </form> : null}
    </div> : null}
    {data?.latest ? <div className={styles.applicationStatus} role="status"><BadgeCheck aria-hidden="true" /><div className={styles.applicationStatusContent}><strong>{data.active ? data.latest.status === "reviewing" ? "Your application is under review." : "Your application is in." : `Your last application was ${data.latest.status}.`}</strong><span>Submitted {formatPortalDate(new Date(data.latest.createdAt).toISOString())}{data.active ? ". You can have one application awaiting a decision." : "."}</span>{data.latest.adminResponse ? <div className={styles.staffResponse} data-application-response><strong><MessageSquareText aria-hidden="true" />Staff response</strong><p>{data.latest.adminResponse}</p></div> : null}</div></div> : null}
    {open && !session ? <Link className={styles.applyLink} href="/api/auth/steam">Sign in with Steam to apply<ArrowRight aria-hidden="true" /></Link> : null}
    {open && session && !data?.active && data?.player ? csrf ? <details className={styles.application} open={Boolean(parameters.error)}>
      <summary><span>Apply to join staff</span><ArrowRight aria-hidden="true" /></summary>
      <RecruitmentApplicationForm csrf={csrf} player={data.player} />
    </details> : <p className={styles.error} role="status">The application form is temporarily unavailable. Please try again later.</p> : null}
  </section>;
}
