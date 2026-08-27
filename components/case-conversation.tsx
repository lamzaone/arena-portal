import Link from "next/link";

import type { CaseMessage } from "@/lib/data/portal-repository";
import type { SteamProfile } from "@/lib/steam/profiles";

import { formatPortalDate } from "@/components/formatters";
import { ResilientRemoteImage } from "@/components/resilient-remote-image";

type CaseConversationProps = {
  openingBody: string;
  openingAt: string;
  openingAuthorId: string;
  messages: CaseMessage[];
  steamProfiles: Map<string, SteamProfile>;
  viewerSteamId: string;
};

function authorName(authorId: string, authorType: "player" | "staff", steamProfiles: Map<string, SteamProfile>, viewerSteamId: string) {
  if (authorId === viewerSteamId) return steamProfiles.get(authorId)?.name ?? "You";
  return steamProfiles.get(authorId)?.name ?? (authorType === "staff" ? "Staff member" : "Player");
}

function avatarInitial(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

function isSteamId(value: string) {
  return /^7656119\d{10}$/.test(value);
}

function MessageCard({ authorId, authorType, body, createdAt, attachments, steamProfiles, viewerSteamId, opening = false }: {
  authorId: string;
  authorType: "player" | "staff";
  body: string;
  createdAt: string;
  attachments: CaseMessage["attachments"];
  steamProfiles: Map<string, SteamProfile>;
  viewerSteamId: string;
  opening?: boolean;
}) {
  const profile = steamProfiles.get(authorId);
  const name = authorName(authorId, authorType, steamProfiles, viewerSteamId);
  const role = authorId === viewerSteamId ? "You" : authorType === "staff" ? "Staff" : "Player";

  const author = <><ResilientRemoteImage src={profile?.avatarFull} alt="" referrerPolicy="no-referrer" fallback={<span aria-hidden="true">{avatarInitial(name)}</span>} /><div><b>{name}</b><small>{opening ? "Original message" : role}</small></div></>;

  return <article className={`case-message case-conversation-message ${authorType}${opening ? " opening" : ""}`}>
    <header className="case-message-header">
      {isSteamId(authorId) ? <Link className="case-message-author" href={`/players/${authorId}`}>{author}</Link> : <div className="case-message-author">{author}</div>}
      <time dateTime={createdAt}>{formatPortalDate(createdAt)}</time>
    </header>
    <p>{body}</p>
    {attachments.length ? <div className="case-message-attachments">{attachments.map((attachment) => <a key={attachment.id} href={`/api/case-attachments/${attachment.id}`} target="_blank" rel="noreferrer">View screenshot: {attachment.fileName}</a>)}</div> : null}
  </article>;
}

export function CaseConversation({ openingBody, openingAt, openingAuthorId, messages, steamProfiles, viewerSteamId }: CaseConversationProps) {
  return <section className="case-conversation" aria-label="Case conversation">
    <div className="case-conversation-label">Conversation</div>
    <MessageCard authorId={openingAuthorId} authorType="player" body={openingBody} createdAt={openingAt} attachments={[]} steamProfiles={steamProfiles} viewerSteamId={viewerSteamId} opening />
    {messages.map((message) => <MessageCard key={message.id} authorId={message.authorId} authorType={message.authorType} body={message.body} createdAt={message.createdAt} attachments={message.attachments} steamProfiles={steamProfiles} viewerSteamId={viewerSteamId} />)}
  </section>;
}
