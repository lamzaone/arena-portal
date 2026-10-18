import Link from "next/link";
import { Flag, Search } from "lucide-react";
import { SearchNavigationForm, SearchSubmitButton } from "@/components/ui/search-field";
import { CASE_PRIORITIES, type CasePriority } from "@/lib/cases/priority";
import { caseFilterOptions, type StaffCaseType } from "@/lib/cases/staff-queue";
import styles from "./case-queue.module.css";

export function CaseQueueFilters({ kind, filter, query, total }: { kind: StaffCaseType; filter: string; query: string; total: number }) {
  const path = kind === "appeal" ? "/admin/appeals" : "/admin/tickets";
  return <section className={styles.filters} aria-label="Filter cases">
    <SearchNavigationForm action={path} className={styles.filterForm}>
      <label htmlFor="case-filter">Case status<select id="case-filter" name="filter" defaultValue={filter}>{caseFilterOptions(kind).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label htmlFor="case-search">Search cases<span className={styles.search}><Search aria-hidden="true" /><input id="case-search" type="search" name="q" defaultValue={query} maxLength={64} placeholder={kind === "appeal" ? "Case #, Steam ID, appeal text" : "Case #, Steam ID, subject, category"} /></span></label>
      <SearchSubmitButton alignWithLabel>Apply filters</SearchSubmitButton>
      {filter !== "all" || query ? <Link className="button button-quiet" href={path}>Reset</Link> : null}
    </SearchNavigationForm>
    <p className={styles.filterSummary}>{total.toLocaleString()} matching {total === 1 ? "case" : "cases"}<span>No staff reply counts player posts separately. Replied · still open excludes closed cases.</span></p>
  </section>;
}

export function CasePriorityTag({ priority = "normal" }: { priority?: CasePriority }) {
  return <span className={styles.priority} data-priority={priority}><Flag aria-hidden="true" />{priority} priority</span>;
}

export function CasePriorityControl({ kind, caseId, priority = "normal", csrf, available }: { kind: StaffCaseType; caseId: number; priority?: CasePriority; csrf: string; available: boolean }) {
  return <form className={styles.priorityForm} action="/api/admin/cases" method="post">
    <input type="hidden" name="action" value={`${kind}-priority`} /><input type="hidden" name="caseId" value={caseId} /><input type="hidden" name="csrf" value={csrf} />
    <label htmlFor={`${kind}-priority-${caseId}`}>Staff priority<select id={`${kind}-priority-${caseId}`} name="priority" defaultValue={priority} disabled={!available}>{CASE_PRIORITIES.map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
    <button className="button button-secondary" type="submit" disabled={!available}>Save priority</button>
    {!available ? <small>Priority labels are temporarily unavailable.</small> : null}
  </form>;
}
