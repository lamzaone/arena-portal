export type StaffCaseType = "appeal" | "ticket";
export type StaffCaseFilters = { filter?: string; query?: string };

const sharedFilters = [
  { value: "all", label: "All cases" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "no-reply", label: "No staff reply" },
  { value: "replied-open", label: "Replied · still open" },
] as const;

export function caseFilterOptions(kind: StaffCaseType) {
  return [...sharedFilters, ...(kind === "appeal"
    ? [{ value: "banned", label: "Closed · banned" }, { value: "unbanned", label: "Closed · unbanned" }]
    : [{ value: "solved", label: "Solved" }, { value: "unsolved", label: "Unsolved" }])];
}

export function normalizeCaseFilter(kind: StaffCaseType, value?: string) {
  return caseFilterOptions(kind).some((option) => option.value === value) ? value! : "all";
}

/** SQL predicates shared by the page and count queries so every page uses the same queue. */
export function caseQueueWhere(kind: StaffCaseType, input: StaffCaseFilters = {}) {
  const filter = normalizeCaseFilter(kind, input.filter);
  const closed = kind === "appeal" ? "'closed-banned', 'closed-unbanned', 'closed'" : "'solved', 'unsolved', 'closed'";
  const open = `c.status NOT IN (${closed})`;
  const messageTable = kind === "appeal" ? "portal_appeal_messages" : "portal_ticket_messages";
  const foreignKey = kind === "appeal" ? "appeal_id" : "ticket_id";
  const staffReply = `EXISTS (SELECT 1 FROM ${messageTable} m WHERE m.${foreignKey} = c.id AND m.author_type = 'staff')`;
  const predicates: string[] = [];
  const values: Array<string | number> = [];
  if (filter === "open") predicates.push(open);
  if (filter === "closed") predicates.push(`c.status IN (${closed})`);
  if (filter === "no-reply") predicates.push(`NOT ${staffReply}`);
  if (filter === "replied-open") predicates.push(open, staffReply);
  const decision = { banned: "closed-banned", unbanned: "closed-unbanned", solved: "solved", unsolved: "unsolved" }[filter];
  if (decision) { predicates.push("c.status = ?"); values.push(decision); }
  const query = (input.query ?? "").trim().slice(0, 64);
  if (query) {
    const columns = ["c.steam_id", "c.body", ...(kind === "ticket" ? ["c.subject", "c.category"] : [])];
    const searches = columns.map((column) => `${column} LIKE ?`);
    values.push(...columns.map(() => `%${query}%`));
    const caseId = Number(query.replace("#", ""));
    if (/^#?\d+$/.test(query) && Number.isSafeInteger(caseId)) { searches.push("c.id = ?"); values.push(caseId); }
    predicates.push(`(${searches.join(" OR ")})`);
  }
  return { where: predicates.length ? `WHERE ${predicates.join(" AND ")}` : "", values };
}
