"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, CheckCircle2, CircleDashed, CircleHelp, Clock3, ShieldCheck, TriangleAlert } from "lucide-react";

import { evaluateRecruitmentRequirements, RECRUITMENT_MINIMUM_PLAYTIME_SECONDS, type RecruitmentRequirementState } from "@/lib/recruitment/requirements";
import styles from "./recruitment.module.css";

type RecruitmentFormPlayer = { nickname: string; playtimeSeconds: number | null; discordLinked: boolean; discordProfile: string };
const statusLabels: Record<RecruitmentRequirementState, string> = { met: "Met", unmet: "Not met", pending: "Pending", unverified: "Unverified" };

export function RecruitmentApplicationForm({ csrf, player }: { csrf: string; player: RecruitmentFormPlayer }) {
  const [age, setAge] = useState("");
  const [steamGroupMember, setSteamGroupMember] = useState<boolean | null>(null);
  const assessment = evaluateRecruitmentRequirements({ age, steamGroupMember, playtimeSeconds: player.playtimeSeconds, discordLinked: player.discordLinked });
  const ageUnmet = assessment.criteria[0].state === "unmet";
  const hoursUnmet = assessment.criteria[1].state === "unmet" || assessment.criteria[1].state === "unverified";

  return <form action="/api/recruitment" method="post" className={styles.form}>
    <input type="hidden" name="csrf" value={csrf} />
    <section className={styles.requirements} aria-labelledby="recruitment-baseline-heading">
      <div className={styles.requirementsHeading}><ShieldCheck aria-hidden="true" /><div><h3 id="recruitment-baseline-heading">Your baseline checklist</h3><p>Age and Steam group answers update as you fill in the form. Staff make the final decision.</p></div></div>
      <ul className={styles.requirementsList}>
        {assessment.criteria.map(criterion => {
          const Icon = criterion.state === "met" ? CheckCircle2 : criterion.state === "pending" ? CircleDashed : criterion.state === "unverified" ? CircleHelp : TriangleAlert;
          return <li key={criterion.key} className={styles.requirement} data-requirement={criterion.key} data-state={criterion.state}>
            <Icon aria-hidden="true" /><div><strong>{criterion.label}</strong><p id={`recruitment-requirement-${criterion.key}`}>{criterion.detail}</p></div><span>{statusLabels[criterion.state]}</span>
          </li>;
        })}
      </ul>
      <p className={assessment.requiresAttention ? styles.requirementsWarning : styles.requirementsGuidance} role="status">
        {assessment.requiresAttention ? <TriangleAlert aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
        <span>{assessment.hasUnmet ? "You do not meet every baseline criterion. This may lower your chance of acceptance. You can still submit your application." : assessment.hasUnverified ? "Some baseline criteria could not be verified. This may lower your chance of acceptance. You can still submit your application." : assessment.allMet ? "You meet the baseline criteria. Acceptance still depends on the staff review." : "You can apply if a baseline criterion is not met, but this may lower your chance of acceptance."}</span>
      </p>
      <noscript><p className={styles.requirementsGuidance}>The checklist cannot update without JavaScript. You can still complete and submit this form; staff will review your age and Steam group answer.</p></noscript>
    </section>
    <label>Steam nickname<input name="nickname" defaultValue={player.nickname} maxLength={128} required autoComplete="nickname" /><small>You can edit the name shown on your application.</small></label>
    <label className={ageUnmet ? styles.fieldUnmet : undefined}>Age<input name="age" type="number" min={1} max={120} step={1} required inputMode="numeric" placeholder="Your age" value={age} onChange={event => setAge(event.currentTarget.value)} aria-describedby="recruitment-requirement-age" /></label>
    <label>Discord profile<input name="discordProfile" type="url" defaultValue={player.discordProfile} readOnly={player.discordLinked} required maxLength={100} placeholder="https://discord.com/users/your-id" /><small>{player.discordLinked ? "Filled from your verified Discord account." : "Paste your Discord profile link. You can verify your account in Settings."}</small></label>
    <div className={styles.connection}><label><input type="checkbox" checked={player.discordLinked} disabled readOnly />Steam and Discord linked</label><small>Verified automatically from your account.{!player.discordLinked ? <> <Link href="/settings">Link Discord in Settings<ArrowRight aria-hidden="true" /></Link></> : null}</small></div>
    <fieldset className={`${styles.groupQuestion}${steamGroupMember === false ? ` ${styles.fieldUnmet}` : ""}`}><legend>Are you in our Steam group?</legend><label><input type="radio" name="steamGroupMember" value="yes" checked={steamGroupMember === true} onChange={() => setSteamGroupMember(true)} required />Yes</label><label><input type="radio" name="steamGroupMember" value="no" checked={steamGroupMember === false} onChange={() => setSteamGroupMember(false)} required />No</label></fieldset>
    <label className={hoursUnmet ? styles.lowHours : undefined}>Server playtime<input readOnly value={player.playtimeSeconds === null ? "Temporarily unavailable" : `${(player.playtimeSeconds / 3600).toFixed(1)} hours`} aria-describedby="recruitment-playtime-help" /><small id="recruitment-playtime-help"><Clock3 aria-hidden="true" />{player.playtimeSeconds === null ? "Staff will see that playtime could not be loaded. You can still apply." : player.playtimeSeconds < RECRUITMENT_MINIMUM_PLAYTIME_SECONDS ? "Below 30 hours. You can still apply; staff will see this note." : "Filled automatically from your server activity."}</small></label>
    <label className={styles.reason}>About you and why you want to join<textarea name="reason" minLength={20} maxLength={5000} required rows={5} placeholder="Tell us about yourself, your experience, and what you’d bring to the team." /><small>20–5,000 characters. Only the staff team can read your application.</small></label>
    <div className={styles.formFooter}><span>One application at a time. We’ll review every submission.</span><button type="submit">Send application<ArrowRight aria-hidden="true" /></button></div>
  </form>;
}
