type CaseStatusTagProps = { status: string };

const labels: Record<string, string> = {
  submitted: "Open",
  "closed-banned": "Closed · banned",
  "closed-unbanned": "Closed · unbanned",
  solved: "Solved",
  unsolved: "Unsolved",
  closed: "Closed"
};

export function CaseStatusTag({ status }: CaseStatusTagProps) {
  const normalized = status.trim().toLowerCase();
  const className = normalized.replace(/[^a-z0-9]+/g, "-") || "unknown";
  return <span className={`case-status-tag is-${className}`}>{labels[normalized] ?? status}</span>;
}

