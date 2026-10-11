import type { CaseMessage } from "../data/portal-repository.ts";

/** Creation uploads were saved as a generated first message in older cases. */
export function splitCaseOpeningAttachments(messages: CaseMessage[], openingAuthorId: string) {
  const first = messages[0];
  const isOpeningUpload = first?.authorType === "player"
    && first.authorId === openingAuthorId
    && first.attachments.length > 0
    && (first.body === "Screenshots attached to the original ticket."
      || first.body === "Screenshots attached to the original appeal.");

  return {
    openingAttachments: isOpeningUpload ? first.attachments : [],
    replies: isOpeningUpload ? messages.slice(1) : messages,
  };
}
