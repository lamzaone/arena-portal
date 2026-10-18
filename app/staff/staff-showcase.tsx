"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, BookOpen, Clock3, Crown, HandHelping, HeartHandshake, MessageCircle, Pause, Play, Search, ShieldCheck, Smile, Swords, Trophy, UsersRound, VolumeX } from "lucide-react";

import { ResilientRemoteImage } from "@/components/resilient-remote-image";
import { BrandEmblem } from "@/components/brand-emblem";
import { IdentityGroupIcon } from "@/components/identity-group-icon";
import { ThemedPlayerContainer } from "@/components/ui/themed-player-container";
import { SearchField } from "@/components/ui/search-field";
import { staffGroupKey, type StaffDirectory, type StaffDirectoryGroup, type StaffDirectoryMember } from "@/lib/staff-directory";
import { commendationKinds, commendationLabels } from "@/lib/profile-community";

import styles from "./staff.module.css";

const commendationIcons = { helpful: HandHelping, teacher: BookOpen, funny: Smile, pro_player: Swords, goat: Crown };
const numberFormatter = new Intl.NumberFormat("en");
const hoursFormatter = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });

function number(value: number | null | undefined) {
  return value == null ? "—" : numberFormatter.format(value);
}

function memberStanding(member: StaffDirectoryMember) {
  const statistics = member.statistics;
  return {
    hours: statistics?.playtimeSeconds == null ? "—" : hoursFormatter.format(statistics.playtimeSeconds / 3600),
    reputation: `${statistics?.reputation != null && statistics.reputation > 0 ? "+" : ""}${number(statistics?.reputation)}`,
  };
}

function groupDescription(group: StaffDirectoryGroup) {
  // The seeded catalogue descriptions explain storage/authority to admins.
  // Use community-facing copy for those defaults, preserving custom bios.
  if (group.description && !/Admins\.Core|immutable external founder authority/i.test(group.description)) return group.description;
  const name = `${group.key} ${group.name}`.toLowerCase();
  if (/founder|owner/.test(name)) return "Leading the community. Setting the standard.";
  if (/senior|sr\./.test(name)) return "Experience, leadership, and a steady hand in every round.";
  if (/admin/.test(name)) return "Keeping the arena fair and the games running smoothly.";
  if (/moderator/.test(name)) return "A welcoming community starts with a little care.";
  return "Here for the players. Here for the community.";
}

function GroupIcon({ icon, className }: { icon: string; className?: string }) {
  return <IdentityGroupIcon icon={icon} className={className} fallback="shield" />;
}

function MemberIdentity({ member, group, linked }: { member: StaffDirectoryMember; group: StaffDirectoryGroup; linked: boolean }) {
  const presence = member.presence === "online" ? "Steam online" : member.presence === "offline" ? "Steam offline" : "Steam member";
  const portrait = <div className={styles.avatar}>
    <ResilientRemoteImage src={member.avatarUrl} alt="" loading="lazy" fallback={<span>{member.name.trim().slice(0, 2).toUpperCase()}</span>} />
    <span className={styles.avatarBadge}><GroupIcon icon={group.icon} /></span>
  </div>;
  return <div className={styles.memberHeader}>
    {linked ? <Link className={styles.portraitLink} href={`/players/${member.steamId}`} prefetch={false} aria-label={`View ${member.name}'s profile`}>{portrait}</Link> : <div className={styles.portraitLink}>{portrait}</div>}
    <div className={styles.memberCopy}>
      <span className={styles.memberRole}><GroupIcon icon={group.icon} /><span>{group.name}</span></span>
      <h4>{linked ? <Link href={`/players/${member.steamId}`} prefetch={false}>{member.name}</Link> : member.name}</h4>
      <span className={styles.presence} data-presence={member.presence}><i aria-hidden="true" />{presence}</span>
    </div>
  </div>;
}

function MemberActions({ member }: { member: StaffDirectoryMember }) {
  return <div className={styles.cardActions}>
    <Link href={`/players/${member.steamId}`} prefetch={false} className={styles.profileAction} aria-label={`View ${member.name}'s profile`}>View profile <ArrowUpRight aria-hidden="true" /></Link>
    {member.discordProfileUrl ? <a href={member.discordProfileUrl} target="_blank" rel="noopener noreferrer" className={styles.discordAction} aria-label={`Open ${member.name}'s Discord profile (opens in a new tab)`}><MessageCircle aria-hidden="true" />Discord <ArrowUpRight aria-hidden="true" /></a> : null}
  </div>;
}

function MemberStatistics({ member, standing = false }: { member: StaffDirectoryMember; standing?: boolean }) {
  const statistics = member.statistics;
  const { hours, reputation } = memberStanding(member);
  return <div className={styles.memberMetrics}>
    {standing ? <dl className={styles.playerStanding} aria-label="Player standing">
      <div><dt><Clock3 aria-hidden="true" />Hours played</dt><dd><strong>{hours}</strong><span>hrs</span></dd></div>
      <div data-negative={statistics?.reputation != null && statistics.reputation < 0 || undefined}><dt><Trophy aria-hidden="true" />Reputation</dt><dd><strong>{reputation}</strong><span>points</span></dd></div>
    </dl> : null}
    <dl className={styles.communicationMetrics} aria-label="Admin actions taken">
      <div className={styles.communicationLabel}><ShieldCheck aria-hidden="true" /><span>Admin actions taken</span></div>
      <div><dt>Bans</dt><dd>{number(statistics?.bansIssued)}</dd></div>
      <div><dt>Kicks · portal</dt><dd>{number(statistics?.kicksIssued)}</dd></div>
      <div><dt>Warns</dt><dd>{number(statistics?.warningsIssued)}</dd></div>
    </dl>
    <dl className={styles.communicationMetrics} aria-label="Communication restrictions issued">
      <div className={styles.communicationLabel}><VolumeX aria-hidden="true" /><span>Communication restrictions issued</span></div>
      <div><dt>Gags</dt><dd>{number(statistics?.communications?.gags)}</dd></div>
      <div><dt>Mutes</dt><dd>{number(statistics?.communications?.mutes)}</dd></div>
      <div><dt>Silences</dt><dd>{number(statistics?.communications?.silences)}</dd></div>
    </dl>
    <section className={styles.commendationsPanel} aria-label="Commendation breakdown">
      <div className={styles.commendationsHeading}><h5><HeartHandshake aria-hidden="true" />Commends</h5><span><strong>{number(statistics?.commendations)}</strong><small>received</small></span></div>
      <dl className={styles.commendationGrid}>
        {commendationKinds.map(kind => {
          const Icon = commendationIcons[kind];
          return <div key={kind} data-commendation={kind}><dt><span><Icon aria-hidden="true" /></span>{commendationLabels[kind]}</dt><dd>{number(statistics?.commendationCounts?.[kind])}</dd></div>;
        })}
      </dl>
    </section>
  </div>;
}

function MemberCard({ member, group, index, motion, featured }: {
  member: StaffDirectoryMember;
  group: StaffDirectoryGroup;
  index: number;
  motion: boolean;
  featured: boolean;
}) {
  const card = useRef<HTMLElement>(null);
  const frame = useRef<number | null>(null);

  function resetTilt() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    card.current?.style.removeProperty("--tilt-x");
    card.current?.style.removeProperty("--tilt-y");
    card.current?.style.removeProperty("--shine-x");
    card.current?.style.removeProperty("--shine-y");
  }

  useEffect(() => {
    if (!motion) resetTilt();
    return () => { if (frame.current !== null) cancelAnimationFrame(frame.current); };
  }, [motion]);

  function tilt(event: PointerEvent<HTMLElement>) {
    if (document.documentElement.dataset.visualMotion === "paused") { resetTilt(); return; }
    if (!motion || event.pointerType !== "mouse" || !window.matchMedia("(hover: hover) and (prefers-reduced-motion: no-preference)").matches) return;
    card.current = event.currentTarget;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    const y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      card.current?.style.setProperty("--tilt-x", `${(0.5 - y) * 4}deg`);
      card.current?.style.setProperty("--tilt-y", `${(x - 0.5) * 5}deg`);
      card.current?.style.setProperty("--shine-x", `${x * 100}%`);
      card.current?.style.setProperty("--shine-y", `${y * 100}%`);
      frame.current = null;
    });
  }

  const { hours, reputation } = memberStanding(member);
  return (
    <ThemedPlayerContainer
      as="article"
      ownerSteamId={member.steamId}
      profileThemeKey={member.profileThemeKey}
      className={styles.card}
      aria-label={`${member.name}, ${group.name}`}
      style={{ "--entry-delay": `${(index % 2) * 90}ms` } as CSSProperties}
      data-staff-reveal="card"
      data-staff-card={featured ? "featured" : "compact"}
      onPointerMove={tilt}
      onPointerLeave={resetTilt}
      onPointerCancel={resetTilt}
      onBlur={resetTilt}
    >
      <GroupIcon icon={group.icon} className={styles.cardWatermark} />
      {featured ? <div className={styles.featuredLayout}>
        <div className={styles.featuredIdentity}>
          <MemberIdentity member={member} group={group} linked />
          <p className={styles.memberDescription}>{groupDescription(group)}</p>
          <MemberActions member={member} />
        </div>
        <MemberStatistics member={member} standing />
      </div> : <details className={styles.memberDetails} data-staff-details>
        <summary className={styles.memberSummary} aria-label={`Details for ${member.name}`}>
          <MemberIdentity member={member} group={group} linked={false} />
          <dl className={styles.summaryStanding} aria-label="Member overview">
            <div><dt><Clock3 aria-hidden="true" />Hours</dt><dd><strong>{hours}</strong><span>hrs</span></dd></div>
            <div data-negative={member.statistics?.reputation != null && member.statistics.reputation < 0 || undefined}><dt><Trophy aria-hidden="true" />Reputation</dt><dd><strong>{reputation}</strong></dd></div>
            <div><dt><HeartHandshake aria-hidden="true" />Commends</dt><dd><strong>{number(member.statistics?.commendations)}</strong></dd></div>
          </dl>
          <span className={styles.detailsToggle}><span className={styles.detailsClosed}>Details</span><span className={styles.detailsOpen}>Less</span><ArrowDown aria-hidden="true" /></span>
        </summary>
        <div className={styles.expandedContent}>
          <MemberStatistics member={member} />
          <MemberActions member={member} />
        </div>
      </details>}
    </ThemedPlayerContainer>
  );
}

export function StaffShowcase({ directory, recruitment }: { directory: StaffDirectory & { available: boolean }; recruitment?: ReactNode }) {
  const showcase = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  const motion = !paused && !reducedMotion;
  const search = query.normalize("NFKC").trim().toLocaleLowerCase("en-US");
  const filtered = directory.groups.filter((group) => selectedGroup === null || group.key === selectedGroup).map((group) => {
    const matchesGroup = `${group.name} ${group.key}`.toLocaleLowerCase("en-US").includes(search);
    return {
      ...group,
      members: !search || matchesGroup ? group.members : group.members.filter((member) => `${member.name} ${member.steamId}`.normalize("NFKC").toLocaleLowerCase("en-US").includes(search)),
    };
  }).filter((group) => !search || group.members.length > 0 || `${group.name} ${group.key}`.toLocaleLowerCase("en-US").includes(search));
  const visibleMemberCount = new Set(filtered.flatMap((group) => group.members.map((member) => member.steamId))).size;
  function clearFilters() { setQuery(""); setSelectedGroup(null); }

  useEffect(() => {
    if (!motion || !showcase.current || !("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const elements = Array.from(showcase.current.querySelectorAll<HTMLElement>("[data-staff-reveal]"));
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        (entry.target as HTMLElement).dataset.revealState = "visible";
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.12 });

    for (const element of elements) {
      // Keep the initial viewport readable before hydration and on filter changes.
      // Offscreen content gets one entrance; the server-rendered fallback is visible.
      if (element.getBoundingClientRect().top < window.innerHeight) continue;
      element.dataset.revealState = "pending";
      observer.observe(element);
    }
    return () => {
      observer.disconnect();
      for (const element of elements) delete element.dataset.revealState;
    };
  }, [motion, query, selectedGroup, directory]);

  function groupButtons() {
    return <>
      <button type="button" aria-pressed={selectedGroup === null} aria-controls="staff-directory" onClick={() => setSelectedGroup(null)}><UsersRound aria-hidden="true" /><span>All staff</span><b>{directory.available ? directory.memberCount : "—"}</b></button>
      {directory.groups.map((group) => <button key={group.key} type="button" aria-pressed={selectedGroup === group.key} aria-controls="staff-directory" onClick={() => setSelectedGroup(group.key)} style={{ "--group-color": group.color } as CSSProperties}><GroupIcon icon={group.icon} /><span>{group.name}</span><b>{group.members.length}</b></button>)}
    </>;
  }

  return (
    <div ref={showcase} className={styles.showcase} data-motion={motion ? "on" : "off"}>
      {recruitment}
      <div className={styles.workspace}>
      <aside className={styles.sidebar} data-staff-sidebar aria-labelledby="staff-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><span /> THE PEOPLE OF TAPPED.RO</p>
          <h1 id="staff-title">Meet <span>the team.</span></h1>
          <p className={styles.lede}>The people behind ARENA. Keeping the games fair, the community welcoming, and the next round ready.</p>
        </div>
        <nav className={`${styles.groupNav} ${styles.sidebarNav}`} aria-label="Staff roles">{groupButtons()}</nav>
        {recruitment ? <a href="#recruitment" className={styles.recruitmentLink}><UsersRound aria-hidden="true" /><span>Want to join the team?</span><ArrowUpRight aria-hidden="true" /></a> : null}
        <button className={styles.motionToggle} type="button" onClick={() => setPaused(!paused)} disabled={reducedMotion} aria-pressed={paused || reducedMotion}>
            {motion ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}{reducedMotion ? "Reduced motion" : paused ? "Resume motion" : "Pause motion"}
        </button>
      </aside>
      <section className={styles.directory} id="staff-directory" aria-labelledby="directory-title">
        <div className={styles.directoryControls}>
          <SearchField
            id="staff-directory-search"
            label="Staff search"
            labelHidden
            aria-label="Search staff by name, group or Steam ID"
            placeholder="Search staff members…"
            value={query}
            onValueChange={setQuery}
            rootClassName={styles.search}
          />
          <nav className={styles.groupNav} aria-label="Filter staff by admin group">{groupButtons()}</nav>
        </div>
          <div className={styles.roster}>
            <div className={styles.rosterMeta}>
              <h2 id="directory-title" className={styles.sectionKicker}>{selectedGroup ? directory.groups.find((group) => group.key === selectedGroup)?.name : "The roster"}</h2>
              <span className={styles.resultCount} role="status">{directory.available ? `${visibleMemberCount} ${visibleMemberCount === 1 ? "member" : "members"}` : "Unavailable"}</span>
            </div>
            <p className={styles.statisticsNote}>Expand a member for full statistics. Kicks show confirmed portal actions; “—” means unavailable.</p>
            {!directory.available ? <div className={styles.empty} role="status"><ShieldCheck aria-hidden="true" /><h3>The team will be right back.</h3><p>The staff directory is temporarily unavailable. Please try again shortly.</p><a href="/staff">Try again <ArrowRight aria-hidden="true" /></a></div> : filtered.length === 0 ? <div className={styles.empty}><Search aria-hidden="true" /><h3>{directory.groups.length ? "No staff found." : "The lineup is on its way."}</h3><p>{directory.groups.length ? "Try another name or explore all admin groups." : "The team will appear here when admin groups are available."}</p>{query || selectedGroup ? <button type="button" onClick={clearFilters}>Show all staff <ArrowRight aria-hidden="true" /></button> : null}</div> : filtered.map((group) => {
              const featured = ["founder", "owner"].includes(staffGroupKey(group.key));
              return <section className={styles.group} key={group.key} data-featured={featured} data-empty={group.members.length === 0} data-single={group.members.length === 1} style={{ "--group-color": group.color } as CSSProperties} aria-labelledby={`staff-group-${encodeURIComponent(group.key)}`}>
                <div className={styles.groupHeading} data-staff-reveal="heading">
                  <span className={styles.groupEmblem}><GroupIcon icon={group.icon} /></span>
                  <div className={styles.groupTitle}><h3 id={`staff-group-${encodeURIComponent(group.key)}`}>{group.name}</h3></div>
                  <span className={styles.groupCount}>{group.members.length} {group.members.length === 1 ? "member" : "members"}</span>
                </div>
                {group.members.length ? <div className={styles.memberGrid}>{group.members.map((member, index) => <MemberCard key={member.steamId} member={member} group={group} index={index} motion={motion} featured={featured} />)}</div> : <div className={styles.emptyGroup}><UsersRound aria-hidden="true" /><span>No active members in this group yet.</span></div>}
              </section>;
            })}
          </div>
      </section>
      </div>
      <footer className={styles.footer} data-staff-reveal="heading"><div><BrandEmblem width={36} /><p>See you <strong>in the arena.</strong></p></div><Link href="/">Let’s play <ArrowUpRight aria-hidden="true" /></Link></footer>
    </div>
  );
}
