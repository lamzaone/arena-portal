"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import styles from "./profile-moderation-history.module.css";

/** Three recent entries keep profiles readable; expansion reveals a bounded, paginated history. */
export function ProfileHistoryList({ items, total, page = 1, label, pagination }: { items: ReactNode[]; total: number; page?: number; label: string; pagination?: ReactNode }) {
  const [expanded, setExpanded] = useState(page > 1);
  const id = useId();
  const visible = expanded ? items : items.slice(0, 3);
  const canExpand = items.length > 3 || total > items.length;

  return <div>
    <ul id={id} className={styles.records}>{visible}</ul>
    {canExpand ? <div className={styles.historyFooter}>
      <span className={styles.count}>{expanded ? `Page ${page}` : `${visible.length} of ${total} records`}</span>
      <button className={styles.expandButton} type="button" aria-expanded={expanded} aria-controls={id} aria-label={`${expanded ? "Show less" : "Show more"} ${label}`} onClick={() => setExpanded((value) => !value)}>
        {expanded ? "Show less" : "Show more"}{expanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
      </button>
    </div> : null}
    {expanded ? pagination : null}
  </div>;
}
