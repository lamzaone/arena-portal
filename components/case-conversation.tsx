import type { CaseMessage } from "@/lib/data/portal-repository";
import type { PlayerIdentityData } from "@/lib/player-identities";
import type { SteamProfile } from "@/lib/steam/profiles";

import { formatPortalDate } from "@/components/formatters";
import { PlayerIdentity } from "@/components/player-identity";
import { ThemedPlayerContainer } from "@/components/ui/themed-player-container";

type CaseConversationProps = {
  openingBody: string;
  openingAt: string;
  openingAuthorId: string;
  messages: CaseMessage[];
  steamProfiles?: Map<string, SteamProfile>;
  viewerSteamId: string;
  playerIdentities?: Readonly<Record<string, PlayerIdentityData>>;
};

function authorName(authorId: string, authorType: "player" | "staff", steamProfiles: Map<string, SteamProfile> | undefined, viewerSteamId: string) {
  if (authorId === viewerSteamId) return steamProfiles?.get(authorId)?.name ?? "You";
  return steamProfiles?.get(authorId)?.name ?? (authorType === "staff" ? "Staff member" : "Player");
}

function MessageCard({ authorId, authorType, body, createdAt, attachments, steamProfiles, viewerSteamId, playerIdentities, opening = false }: {
  authorId: string;
  authorType: "player" | "staff";
  body: string;
  createdAt: string;
  attachments: CaseMessage["attachments"];
  steamProfiles?: Map<string, SteamProfile>;
  viewerSteamId: string;
  playerIdentities?: Readonly<Record<string, PlayerIdentityData>>;
  opening?: boolean;
}) {
  const profile = steamProfiles?.get(authorId);
  const resolvedPlayer = playerIdentities?.[authorId];
  const name = resolvedPlayer?.displayName ?? authorName(authorId, authorType, steamProfiles, viewerSteamId);
  const role = authorId === viewerSteamId ? "You" : authorType === "staff" ? "Staff" : "Player";
  const player = resolvedPlayer ?? {
    steamId: authorId,
    displayName: name,
    avatarUrl: profile?.avatarFull ?? null,
    presence: profile?.presence ?? "unknown",
    profileThemeKey: null,
    identityGroups: [],
  } satisfies PlayerIdentityData;

  return <ThemedPlayerContainer
    as="article"
    className={`case-message case-conversation-message ${authorType}${opening ? " opening" : ""}`}
    containerKind="message"
    ownerSteamId={player.steamId}
    profileThemeKey={player.profileThemeKey}
  >
    <header className="case-message-header">
      <PlayerIdentity
        player={player}
        variant="compact"
        className="case-message-author"
        secondary={opening ? "Original message" : role}
      />
      <time dateTime={createdAt}>{formatPortalDate(createdAt)}</time>
    </header>
    <p>{body}</p>
    {attachments.length ? <div className="case-message-attachments">{attachments.map((attachment) => <a key={attachment.id} href={`/api/case-attachments/${attachment.id}`} target="_blank" rel="noreferrer">View screenshot: {attachment.fileName}</a>)}</div> : null}
  </ThemedPlayerContainer>;
}

export function CaseConversation({ openingBody, openingAt, openingAuthorId, messages, steamProfiles, viewerSteamId, playerIdentities }: CaseConversationProps) {
  return <section className="case-conversation" aria-label="Case conversation">
    <div className="case-conversation-label">Conversation</div>
    <MessageCard authorId={openingAuthorId} authorType="player" body={openingBody} createdAt={openingAt} attachments={[]} steamProfiles={steamProfiles} viewerSteamId={viewerSteamId} playerIdentities={playerIdentities} opening />
    {messages.map((message) => <MessageCard key={message.id} authorId={message.authorId} authorType={message.authorType} body={message.body} createdAt={message.createdAt} attachments={message.attachments} steamProfiles={steamProfiles} viewerSteamId={viewerSteamId} playerIdentities={playerIdentities} />)}
  </section>;
}
