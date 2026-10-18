"use client";

import { Award, BookOpen, Check, ChevronLeft, ChevronRight, Crown, HandHelping, LockKeyhole, MessageSquare, Send, Smile, Sparkles, Swords, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { PlayerIdentity } from "@/components/player-identity";
import { AsyncButton } from "@/components/ui/async-button";
import { ThemedPlayerContainer } from "@/components/ui/themed-player-container";
import { commendationKinds, commendationLabels, type CommendationKind, type ProfileCommunity, type ProfileCommunityAction } from "@/lib/profile-community";
import type { PlayerIdentityData } from "@/lib/player-identities";
import styles from "./profile-community.module.css";

type CommunityResponse = { ok?: boolean; message?: string; community?: ProfileCommunity; identities?: Record<string, PlayerIdentityData> };
type CommunityProps = {
  steamId: string;
  viewerSteamId: string | null;
  csrf: string;
  initialCommunity: ProfileCommunity;
  initialIdentities?: Record<string, PlayerIdentityData>;
};
const icons = { helpful: HandHelping, teacher: BookOpen, funny: Smile, pro_player: Swords, goat: Crown };
const dates = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" });
const counts = new Intl.NumberFormat("en-US");
const emptyIdentities: Record<string, PlayerIdentityData> = {};
const sameKinds = (left: CommendationKind[], right: CommendationKind[]) => left.length === right.length && left.every(kind => right.includes(kind));

function useCommunityActions(steamId: string, csrf: string) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function run(action: ProfileCommunityAction | { action: "page"; page: number }, page = 1): Promise<CommunityResponse | null> {
    if (inFlight.current) return null;
    inFlight.current = true;
    const start = performance.now();
    setBusy(action.action); setNotice(null);
    try {
      const reading = action.action === "page";
      const response = await fetch(`/api/players/${steamId}/community${reading ? `?page=${action.page}` : ""}`, reading
        ? { credentials: "same-origin", cache: "no-store" }
        : { method: "POST", credentials: "same-origin", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify({ ...action, csrf, page }) });
      const result = await response.json().catch(() => null) as CommunityResponse | null;
      if (!response.ok || !result?.ok || !result.community) throw new Error(result?.message ?? "This profile action could not be completed. Try again shortly.");
      if (mounted.current) {
        if (!reading) { setNotice({ ok: true, message: result.message ?? "Saved." }); router.refresh(); }
        return result;
      }
    } catch (error) {
      if (mounted.current) setNotice({ ok: false, message: error instanceof Error ? error.message : "This profile action could not be completed." });
    } finally {
      // A synchronous ref also stops two clicks before React has re-rendered.
      const remaining = Math.max(0, 500 - (performance.now() - start));
      window.setTimeout(() => { inFlight.current = false; if (mounted.current) setBusy(null); }, remaining);
    }
    return null;
  }
  return { run, busy, notice };
}

function Notice({ value }: { value: { ok: boolean; message: string } | null }) {
  return value ? <p className={`${styles.notice} ${value.ok ? styles.success : styles.error}`} role={value.ok ? "status" : "alert"}>{value.ok ? <Check aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />}{value.message}</p> : null;
}

export function ProfileCommunityPanel({ steamId, viewerSteamId, csrf, initialCommunity, initialIdentities = emptyIdentities }: CommunityProps) {
  const [community, setCommunity] = useState(initialCommunity);
  const [identities, setIdentities] = useState(initialIdentities);
  const [selected, setSelected] = useState(initialCommunity.myCommendations);
  const [comment, setComment] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const commentRequest = useRef<{ body: string; id: string } | null>(null);
  const commentsFetchedByClient = useRef(false);
  const { run, busy, notice } = useCommunityActions(steamId, csrf);
  const own = viewerSteamId === steamId;
  const canInteract = Boolean(viewerSteamId && !own && community.available && csrf);
  useEffect(() => {
    // The route renders page 1 on refresh. Once this mounted profile has an
    // API snapshot, its comment page (including confirmed deletions and any
    // server-side page clamp) remains authoritative until the next API read.
    // Refreshes still update aggregates/settings without jumping the wall.
    setCommunity(current => commentsFetchedByClient.current ? { ...initialCommunity, comments: current.comments } : initialCommunity);
    setSelected(initialCommunity.myCommendations);
    setIdentities(current => ({ ...current, ...initialIdentities }));
  }, [initialCommunity, initialIdentities]);

  function apply(result: CommunityResponse | null) {
    if (!result?.community) return;
    commentsFetchedByClient.current = true;
    setCommunity(result.community); setIdentities(current => ({ ...current, ...result.identities })); setSelected(result.community.myCommendations);
  }
  async function submitComment(event: FormEvent) {
    event.preventDefault();
    const body = comment.trim();
    if (!body || !canInteract || busy) return;
    if (commentRequest.current?.body !== body) commentRequest.current = { body, id: crypto.randomUUID() };
    const result = await run({ action: "comment", body, requestId: commentRequest.current.id });
    if (result) { apply(result); setComment(""); commentRequest.current = null; }
  }
  const pages = Math.max(1, Math.ceil(community.comments.total / community.comments.pageSize));

  return <section className={styles.community} id="community" aria-labelledby="profile-community-heading">
    <header className={styles.heading}>
      <div><p className="eyebrow"><Sparkles aria-hidden="true" /> Community standing</p><h2 id="profile-community-heading">A reputation built together.</h2><p>The player behind the scoreboard. Recognise great teammates and leave a message.</p></div>
      <span className={styles.headingIcon} aria-hidden="true"><Award /></span>
    </header>
    {!community.available ? <div className={styles.unavailable}><LockKeyhole aria-hidden="true" /><div><strong>Community features are temporarily unavailable.</strong><p>Reputation, commendations and comments will appear when profile community storage is ready.</p></div></div> : <>
      <div className={styles.standing}>
        <article className={styles.reputation} data-ui="panel" data-panel-light>
          <div className={styles.cardLabel}><ThumbsUp aria-hidden="true" /><span>Reputation</span></div>
          <strong className={styles.score} data-negative={community.reputation < 0 || undefined}>{community.reputation > 0 ? "+" : ""}{counts.format(community.reputation)}</strong>
          <p>One voice per player.<br />Your vote can always be changed.</p>
          <div className={styles.voteActions}>
            <button type="button" aria-label="Give +1 reputation" aria-pressed={community.myReputation === 1} disabled={!canInteract || Boolean(busy)} onClick={async () => apply(await run({ action: "reputation", value: community.myReputation === 1 ? 0 : 1 }, community.comments.page))}><ThumbsUp aria-hidden="true" /><span>+1</span></button>
            <button type="button" aria-label="Give -1 reputation" aria-pressed={community.myReputation === -1} disabled={!canInteract || Boolean(busy)} onClick={async () => apply(await run({ action: "reputation", value: community.myReputation === -1 ? 0 : -1 }, community.comments.page))}><ThumbsDown aria-hidden="true" /><span>−1</span></button>
          </div>
          {community.myReputation ? <small className={styles.hint}>Your {community.myReputation > 0 ? "+1" : "−1"} vote is saved. Select it again to remove.</small> : null}
        </article>
        <article className={styles.commends} data-ui="panel" data-panel-light>
          <div className={styles.commendHeading}><div><span className={styles.cardLabel}><Award aria-hidden="true" />Commendations</span><h3>Give good play its flowers.</h3></div><span className={styles.total}><strong>{counts.format(community.commendationTotal)}</strong>received</span></div>
          <div className={styles.commendChoices} role="group" aria-label="Choose commendations">
            {commendationKinds.map(kind => {
              const Icon = icons[kind];
              return <button key={kind} type="button" className={styles.commend} data-depth-card aria-pressed={selected.includes(kind)} disabled={!canInteract || Boolean(busy)} onClick={() => setSelected(current => current.includes(kind) ? current.filter(value => value !== kind) : [...current, kind])}>
                <span className={styles.medal} data-depth-art><Icon aria-hidden="true" />{selected.includes(kind) ? <Check className={styles.selectionCheck} aria-hidden="true" /> : null}</span><strong>{commendationLabels[kind]}</strong><span className={styles.commendCount}>{counts.format(community.commendations[kind])}</span>
              </button>;
            })}
          </div>
          <div className={styles.commendFooter}><p>{own ? "Commendations from your teammates appear here." : "Choose any that fit. You can update your selection later."}</p>{canInteract ? <AsyncButton className="button button-primary" disabled={sameKinds(selected, community.myCommendations) || Boolean(busy)} pending={busy === "commendations"} pendingLabel="Saving…" icon={<Award aria-hidden="true" />} onClick={async () => apply(await run({ action: "commendations", kinds: selected }, community.comments.page))}>Save commendations</AsyncButton> : null}</div>
        </article>
      </div>
      {!viewerSteamId ? <p className={styles.signIn}><Link href="/api/auth/steam">Sign in with Steam</Link> to give reputation, commend teammates and leave a comment.</p> : null}
      <Notice value={notice} />
      <article className={styles.comments} data-ui="panel" data-panel-light>
        <header className={styles.commentsHeading}><div><span className={styles.cardLabel}><MessageSquare aria-hidden="true" />Player wall</span><h3>Profile comments <span>{counts.format(community.comments.total)}</span></h3></div>{own ? <Link className={styles.settingsLink} href={`/players/${steamId}?settings=1`}>Comment settings</Link> : null}</header>
        {!community.commentsEnabled ? <p className={styles.closed}><LockKeyhole aria-hidden="true" />This player has turned off new profile comments.</p> : canInteract ? <form className={styles.composer} onSubmit={submitComment} aria-busy={busy === "comment" || undefined}>
          <label htmlFor="profile-comment-body">Leave a message</label><textarea id="profile-comment-body" value={comment} maxLength={1000} rows={3} disabled={Boolean(busy)} onChange={event => setComment(event.target.value)} placeholder="A great teammate, a memorable round, a well-earned GG…" required />
          <div><small>{comment.length}/1000 · Plain text</small><AsyncButton className="button button-primary" type="submit" disabled={!comment.trim() || Boolean(busy)} pending={busy === "comment"} pendingLabel="Posting…" icon={<Send aria-hidden="true" />}>Post comment</AsyncButton></div>
        </form> : own ? <p className={styles.hint}>Your teammates can leave messages here. You can delete any comment on your profile.</p> : null}
        {community.comments.records.length ? <ol className={styles.commentList}>{community.comments.records.map(entry => {
          const identity = identities[entry.authorSteamId] ?? { steamId: entry.authorSteamId, displayName: entry.authorSteamId, avatarUrl: null, presence: "unknown" as const, profileThemeKey: null, identityGroups: [] };
          return <ThemedPlayerContainer as="li" profileThemeKey={identity.profileThemeKey} ownerSteamId={identity.steamId} containerKind="message" className={styles.commentEntry} key={entry.id}><div className={styles.commentHeader}><PlayerIdentity player={identity} variant="compact" hoverCard={false} /><time dateTime={new Date(entry.createdAt).toISOString()}>{dates.format(new Date(entry.createdAt))}</time></div><p className={styles.commentBody}>{entry.body}</p>{entry.canDelete ? <div className={styles.deleteRow}>{deleteId === entry.id ? <><span>Delete this comment?</span><button type="button" disabled={Boolean(busy)} onClick={async () => { apply(await run({ action: "delete_comment", commentId: entry.id }, community.comments.page)); setDeleteId(null); }}>Delete</button><button type="button" disabled={Boolean(busy)} onClick={() => setDeleteId(null)}>Cancel</button></> : <button type="button" disabled={Boolean(busy)} onClick={() => setDeleteId(entry.id)} aria-label={`Delete comment by ${identity.displayName}`}><Trash2 aria-hidden="true" />Delete</button>}</div> : null}</ThemedPlayerContainer>;
        })}</ol> : <div className={styles.empty}><MessageSquare aria-hidden="true" /><strong>No comments yet.</strong><p>{own ? "Your profile wall is ready for the community." : community.commentsEnabled ? "Be the first to leave a good word." : "New comments are currently disabled."}</p></div>}
        {pages > 1 ? <nav className={styles.pagination} aria-label="Profile comment pages"><button type="button" disabled={community.comments.page <= 1 || Boolean(busy)} onClick={async () => apply(await run({ action: "page", page: community.comments.page - 1 }))}><ChevronLeft aria-hidden="true" />Previous</button><span aria-live="polite">Page {community.comments.page} of {pages}</span><button type="button" disabled={community.comments.page >= pages || Boolean(busy)} onClick={async () => apply(await run({ action: "page", page: community.comments.page + 1 }))}>Next<ChevronRight aria-hidden="true" /></button></nav> : null}
      </article>
    </>}
  </section>;
}

export function ProfileCommentSettings({ steamId, csrf, initialCommunity }: Pick<CommunityProps, "steamId" | "csrf" | "initialCommunity">) {
  const [enabled, setEnabled] = useState(initialCommunity.commentsEnabled);
  const { run, busy, notice } = useCommunityActions(steamId, csrf);
  useEffect(() => setEnabled(initialCommunity.commentsEnabled), [initialCommunity.commentsEnabled]);
  return <section className={`${styles.commentSettings} panel settings-section`} aria-labelledby="profile-comments-settings-heading">
    <div><span className="eyebrow"><MessageSquare aria-hidden="true" /> Your profile wall</span><h3 id="profile-comments-settings-heading">Let the community leave a message.</h3><p>Signed-in players can comment on your profile. You and each comment’s author can delete comments. Turning this off keeps existing comments visible.</p></div>
    {initialCommunity.available ? <label className={styles.toggle}><input type="checkbox" role="switch" checked={enabled} disabled={Boolean(busy)} onChange={async event => { const next = event.target.checked; const result = await run({ action: "comments_setting", enabled: next }); if (result?.community) setEnabled(result.community.commentsEnabled); }} /><span><strong>Allow profile comments</strong><small>{enabled ? "Your profile wall is open." : "New comments are turned off."}</small></span><i aria-hidden="true" /></label> : <p className={styles.hint}>Comment settings will be available after the profile community database update.</p>}
    <Notice value={notice} />
  </section>;
}
