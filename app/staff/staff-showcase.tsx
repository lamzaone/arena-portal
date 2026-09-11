"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, BadgeCheck, Crown, Crosshair, Pause, Play, Search, ShieldCheck, Sparkles, Star, UsersRound, X } from "lucide-react";

import { ResilientRemoteImage } from "@/components/resilient-remote-image";
import { BrandEmblem } from "@/components/brand-emblem";
import { ThemedPlayerContainer } from "@/components/ui/themed-player-container";
import type { StaffDirectory, StaffDirectoryGroup, StaffDirectoryMember } from "@/lib/staff-directory";

import styles from "./staff.module.css";

const groupIcons = { crown: Crown, shield: ShieldCheck, badge: BadgeCheck, star: Star, sparkles: Sparkles, users: UsersRound };

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
  const Icon = groupIcons[icon as keyof typeof groupIcons] ?? ShieldCheck;
  return <Icon className={className} aria-hidden="true" />;
}

function MemberCard({ member, group, index, motion }: {
  member: StaffDirectoryMember;
  group: StaffDirectoryGroup;
  index: number;
  motion: boolean;
}) {
  const card = useRef<HTMLAnchorElement>(null);
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

  function tilt(event: PointerEvent<HTMLAnchorElement>) {
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

  const presence = member.presence === "online" ? "Steam online" : member.presence === "offline" ? "Steam offline" : "Steam member";
  return (
    <ThemedPlayerContainer
      as={Link}
      ownerSteamId={member.steamId}
      profileThemeKey={member.profileThemeKey}
      className={styles.card}
      href={`/players/${member.steamId}`}
      prefetch={false}
      aria-label={`View ${member.name}'s profile, ${group.name}`}
      style={{ "--entry-delay": `${(index % 2) * 90}ms` } as CSSProperties}
      data-staff-reveal="card"
      onPointerMove={tilt}
      onPointerLeave={resetTilt}
      onPointerCancel={resetTilt}
      onBlur={resetTilt}
    >
      <div className={styles.cardTop}>
        <span className={styles.memberRole}><GroupIcon icon={group.icon} /><span title={group.name}>{group.name}</span></span>
        <span className={styles.memberNumber} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
      </div>
      <GroupIcon icon={group.icon} className={styles.cardWatermark} />
      <div className={styles.memberBody}>
        <div className={styles.avatar}>
          <ResilientRemoteImage src={member.avatarUrl} alt="" loading="lazy" fallback={<span>{member.name.trim().slice(0, 2).toUpperCase()}</span>} />
          <span className={styles.avatarBadge}><GroupIcon icon={group.icon} /></span>
        </div>
        <div className={styles.memberCopy}>
          <h4 title={member.name}>{member.name}</h4>
          <span className={styles.presence} data-presence={member.presence}><i />{presence}</span>
        </div>
      </div>
      <div className={styles.cardBottom}><span>TAPPED.RO / THE TEAM</span><span>Meet the player <ArrowUpRight className={styles.cardArrow} aria-hidden="true" /></span></div>
    </ThemedPlayerContainer>
  );
}

export function StaffShowcase({ directory }: { directory: StaffDirectory & { available: boolean } }) {
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

  return (
    <div ref={showcase} className={styles.showcase} data-motion={motion ? "on" : "off"}>
      <section className={styles.hero} aria-labelledby="staff-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><span /> THE PEOPLE OF TAPPED.RO</p>
          <h1 id="staff-title">Good people.<br /><span>Great games.</span></h1>
          <p className={styles.lede}>Behind every fair round is someone who cares. Meet the players keeping this community in good hands.</p>
          <a href="#staff-directory" className={styles.explore} onClick={(event) => {
            if (motion) return;
            event.preventDefault();
            document.getElementById("staff-directory")?.scrollIntoView({ behavior: "instant" });
            window.history.replaceState(window.history.state, "", "#staff-directory");
          }}>Get to know the team <span><ArrowDown aria-hidden="true" /></span></a>
        </div>
        <div className={styles.heroArt} aria-hidden="true">
          <span className={styles.artWord}>STAFF</span>
          <div className={styles.orbitScene}>
            <div className={styles.orbitRing} /><div className={styles.orbitRingInner} />
            <div className={styles.crest}>
              <BrandEmblem width={800} priority className={styles.heroLogo} />
            </div>
            <div className={`${styles.floatingTag} ${styles.tagTop}`}><Crosshair /><span>FAIR PLAY.<br /><strong>EVERY ROUND.</strong></span></div>
            <div className={`${styles.floatingTag} ${styles.tagBottom}`}><UsersRound /><span>BUILT BY PLAYERS.<br /><strong>HERE FOR YOU.</strong></span></div>
            <span className={styles.orbitDot} />
          </div>
        </div>
      </section>

      <div className={styles.overview}>
        <div className={styles.overviewLabel}><ShieldCheck aria-hidden="true" /><span>Different roles.<br /><strong>One shared purpose.</strong></span></div>
        <dl className={styles.stats}>
          <div><dt>Staff members</dt><dd>{directory.available ? String(directory.memberCount).padStart(2, "0") : "—"}</dd></div>
          <div><dt>Admin groups</dt><dd>{directory.available ? String(directory.groups.length).padStart(2, "0") : "—"}</dd></div>
          <div><dt><i /> Steam online</dt><dd>{directory.available ? String(directory.onlineCount).padStart(2, "0") : "—"}</dd></div>
        </dl>
      </div>

      <section className={styles.directory} id="staff-directory" aria-labelledby="directory-title">
        <div className={styles.directoryHeading}>
          <div><p className={styles.eyebrow}>THE LINEUP / TAPPED.RO</p><h2 id="directory-title">Your arena. <span>Your people.</span></h2></div>
          <button className={styles.motionToggle} type="button" onClick={() => setPaused(!paused)} disabled={reducedMotion} aria-pressed={paused || reducedMotion}>
            {motion ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}{reducedMotion ? "Reduced motion" : paused ? "Resume motion" : "Pause motion"}
          </button>
        </div>
        <div className={styles.directoryControls}>
              <nav className={styles.groupNav} aria-label="Filter staff by admin group">
                <button type="button" aria-pressed={selectedGroup === null} onClick={() => setSelectedGroup(null)}><UsersRound aria-hidden="true" /><span>All groups</span><b>{directory.groups.length}</b></button>
                {directory.groups.map((group) => <button key={group.key} type="button" aria-pressed={selectedGroup === group.key} onClick={() => setSelectedGroup(group.key)} style={{ "--group-color": group.color } as CSSProperties}><GroupIcon icon={group.icon} /><span>{group.name}</span><b>{group.members.length}</b></button>)}
              </nav>
              <div className={styles.search}><Search aria-hidden="true" /><input aria-label="Search staff by name, group or Steam ID" type="search" placeholder="Find your people…" value={query} onChange={(event) => setQuery(event.target.value)} />{query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear staff search"><X aria-hidden="true" /></button> : null}</div>
        </div>
          <div className={styles.roster}>
            <div className={styles.rosterMeta}>
              <span>{selectedGroup ? directory.groups.find((group) => group.key === selectedGroup)?.name : "ALL HANDS ON DECK"}</span>
              <span className={styles.resultCount} role="status">{directory.available ? `${visibleMemberCount} ${visibleMemberCount === 1 ? "member" : "members"}` : "Unavailable"}</span>
            </div>
            {!directory.available ? <div className={styles.empty} role="status"><ShieldCheck aria-hidden="true" /><h3>The team will be right back.</h3><p>The staff directory is temporarily unavailable. Please try again shortly.</p><a href="/staff">Try again <ArrowRight aria-hidden="true" /></a></div> : filtered.length === 0 ? <div className={styles.empty}><Search aria-hidden="true" /><h3>{directory.groups.length ? "No staff found." : "The lineup is on its way."}</h3><p>{directory.groups.length ? "Try another name or explore all admin groups." : "The team will appear here when admin groups are available."}</p>{query || selectedGroup ? <button type="button" onClick={clearFilters}>Show all staff <ArrowRight aria-hidden="true" /></button> : null}</div> : filtered.map((group) => {
              const position = directory.groups.findIndex((entry) => entry.key === group.key) + 1;
              return <section className={styles.group} key={group.key} data-empty={group.members.length === 0} data-single={group.members.length === 1} style={{ "--group-color": group.color } as CSSProperties} aria-labelledby={`staff-group-${encodeURIComponent(group.key)}`}>
                <div className={styles.groupHeading} data-staff-reveal="heading">
                  <div className={styles.groupIndex}><span className={styles.groupNumber} aria-hidden="true">{String(position).padStart(2, "0")}</span><span className={styles.groupEmblem}><GroupIcon icon={group.icon} /></span></div>
                  <div className={styles.groupTitle}><h3 id={`staff-group-${encodeURIComponent(group.key)}`}>{group.name}</h3><span>{group.members.length}</span></div><p>{groupDescription(group)}</p>
                  <span className={styles.groupRule} aria-hidden="true" />
                </div>
                {group.members.length ? <div className={styles.memberGrid}>{group.members.map((member, index) => <MemberCard key={member.steamId} member={member} group={group} index={index} motion={motion} />)}</div> : <div className={styles.emptyGroup}><UsersRound aria-hidden="true" /><span>No active members in this group yet.</span></div>}
              </section>;
            })}
          </div>
      </section>
      <footer className={styles.footer} data-staff-reveal="heading"><div><BrandEmblem width={36} /><p>See you <strong>in the arena.</strong></p></div><Link href="/">Let’s play <ArrowUpRight aria-hidden="true" /></Link></footer>
    </div>
  );
}
