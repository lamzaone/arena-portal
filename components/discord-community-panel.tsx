"use client";

import { ArrowUpRight, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";

import { DiscordMark } from "@/components/icons/discord-mark";
import { COMMUNITY_DISCORD_INVITE, type PublicCommunity } from "@/lib/discord/public-community";
import { browserPollingEnvironment, createVisiblePoller } from "@/lib/server-link/client-polling";

import styles from "./discord-community-panel.module.css";

export function DiscordCommunityPanel() {
  const [community, setCommunity] = useState<PublicCommunity | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const poller = createVisiblePoller({
      environment: browserPollingEnvironment(), intervalMs: 60_000, requestTimeoutMs: 4_000,
      request: async (signal) => {
        const response = await fetch("/api/community/discord", { cache: "no-store", signal });
        if (!response.ok) throw new Error("Discord stats unavailable");
        return await response.json() as PublicCommunity;
      },
      onSuccess(value) { setCommunity(value); setUnavailable(value.state !== "available"); },
      onFailure() { setCommunity(null); setUnavailable(true); },
    });
    return () => poller.dispose();
  }, []);

  const available = community?.state === "available";
  return (
    <aside className={styles.panel} aria-labelledby="discord-community-title" data-panel-light>
      <div className={styles.topline}><span><DiscordMark /> Community Discord</span><ArrowUpRight aria-hidden="true" /></div>
      <h2 id="discord-community-title">The lobby<br /><span>between rounds.</span></h2>
      <p>Find your next challenger, meet the team, and stay close to the community.</p>
      <dl className={styles.stats} aria-label="Approximate Discord server statistics">
        <div><dt><UsersRound aria-hidden="true" /> Members</dt><dd>{available ? community.members?.toLocaleString("en-GB") : "—"}</dd></div>
        <div><dt><i aria-hidden="true" /> Online on Discord</dt><dd>{available ? community.online?.toLocaleString("en-GB") : "—"}</dd></div>
      </dl>
      <p className={styles.note} role="status">{available ? "Approximate Discord counts · refreshed regularly" : unavailable ? "Discord stats are temporarily unavailable." : "Checking the Discord community…"}</p>
      <a className="button button-secondary" href={COMMUNITY_DISCORD_INVITE} target="_blank" rel="noopener noreferrer"><DiscordMark /> Join our Discord <ArrowUpRight aria-hidden="true" /></a>
    </aside>
  );
}
