import Link from "next/link";
import { ArrowRight, BadgeCheck, Clock3, ClipboardList, ShieldCheck, UsersRound } from "lucide-react";

import { getAdminAccess } from "@/lib/admin/access";
import { createAdminActionToken, createProfileActionToken, type PortalSession } from "@/lib/auth/session";
import { formatPortalDate } from "@/components/formatters";
import { getRecruitmentPlayer, recruitmentMessage, staffRecruitmentRepository } from "@/lib/recruitment/service";

import styles from "./recruitment.module.css";

export type RecruitmentSearchParams = { notice?: string; error?: string };

export async function RecruitmentSection({ session, parameters }: { session: PortalSession | null; parameters: RecruitmentSearchParams }) {
  const actor = session ? await getAdminAccess(session.steamId).catch(() => null) : null;
  let data;
  try {
    const repository = staffRecruitmentRepository();
    const [state, latest] = await Promise.all([repository.getState(), session ? repository.getOwnLatest(session.steamId) : null]);
    const active = latest && ["submitted", "reviewing"].includes(latest.status);
    const player = state.open && session && !active ? await getRecruitmentPlayer(session.steamId) : null;
    data = { state, latest, active, player };
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
    {message ? <p className={parameters.error ? styles.error : styles.notice} role={parameters.error ? "alert" : "status"}>{message}</p> : null}
    {actor?.isAdmin && session ? <div className={styles.staffControls}>
      <Link href="/admin/recruitment"><ClipboardList aria-hidden="true" />Review applications<ArrowRight aria-hidden="true" /></Link>
      {data ? <form action="/api/admin/recruitment" method="post">
        <input type="hidden" name="csrf" value={createAdminActionToken(session)} />
        <input type="hidden" name="action" value="set-open" /><input type="hidden" name="open" value={open ? "no" : "yes"} /><input type="hidden" name="returnTo" value="/staff" />
        <button type="submit"><ShieldCheck aria-hidden="true" />{open ? "Close recruitment" : "Open recruitment"}</button>
      </form> : null}
    </div> : null}
    {data?.latest ? <div className={styles.applicationStatus} role="status"><BadgeCheck aria-hidden="true" /><div><strong>{data.active ? data.latest.status === "reviewing" ? "Your application is under review." : "Your application is in." : `Your last application was ${data.latest.status}.`}</strong><span>Submitted {formatPortalDate(new Date(data.latest.createdAt).toISOString())}{data.active ? ". You can have one application awaiting a decision." : "."}</span></div></div> : null}
    {open && !session ? <Link className={styles.applyLink} href="/api/auth/steam">Sign in with Steam to apply<ArrowRight aria-hidden="true" /></Link> : null}
    {open && session && !data?.active && data?.player ? csrf ? <details className={styles.application} open={Boolean(parameters.error)}>
      <summary><span>Apply to join staff</span><ArrowRight aria-hidden="true" /></summary>
      <form action="/api/recruitment" method="post" className={styles.form}>
        <input type="hidden" name="csrf" value={csrf} />
        <label>Steam nickname<input name="nickname" defaultValue={data.player.nickname} maxLength={128} required autoComplete="nickname" /><small>You can edit the name shown on your application.</small></label>
        <label>Age<input name="age" type="number" min={1} max={120} step={1} required inputMode="numeric" placeholder="Your age" /></label>
        <label>Discord profile<input name="discordProfile" type="url" defaultValue={data.player.discordProfile} readOnly={data.player.discordLinked} required maxLength={100} placeholder="https://discord.com/users/your-id" /><small>{data.player.discordLinked ? "Filled from your verified Discord account." : "Paste your Discord profile link. You can verify your account in Settings."}</small></label>
        <div className={styles.connection}><label><input type="checkbox" checked={data.player.discordLinked} disabled readOnly />Steam and Discord linked</label><small>Verified automatically from your account.{!data.player.discordLinked ? <> <Link href="/settings">Link Discord in Settings<ArrowRight aria-hidden="true" /></Link></> : null}</small></div>
        <fieldset className={styles.groupQuestion}><legend>Are you in our Steam group?</legend><label><input type="radio" name="steamGroupMember" value="yes" required />Yes</label><label><input type="radio" name="steamGroupMember" value="no" required />No</label></fieldset>
        <label className={data.player.playtimeSeconds !== null && data.player.playtimeSeconds < 108000 ? styles.lowHours : undefined}>Server playtime<input readOnly value={data.player.playtimeSeconds === null ? "Temporarily unavailable" : `${(data.player.playtimeSeconds / 3600).toFixed(1)} hours`} aria-describedby="recruitment-playtime-help" /><small id="recruitment-playtime-help"><Clock3 aria-hidden="true" />{data.player.playtimeSeconds === null ? "Staff will see that playtime could not be loaded. You can still apply." : data.player.playtimeSeconds < 108000 ? "Below 30 hours. You can still apply; staff will see this note." : "Filled automatically from your server activity."}</small></label>
        <label className={styles.reason}>About you and why you want to join<textarea name="reason" minLength={20} maxLength={5000} required rows={5} placeholder="Tell us about yourself, your experience, and what you’d bring to the team." /><small>20–5,000 characters. Only the staff team can read your application.</small></label>
        <div className={styles.formFooter}><span>One application at a time. We’ll review every submission.</span><button type="submit">Send application<ArrowRight aria-hidden="true" /></button></div>
      </form>
    </details> : <p className={styles.error} role="status">The application form is temporarily unavailable. Please try again later.</p> : null}
  </section>;
}
