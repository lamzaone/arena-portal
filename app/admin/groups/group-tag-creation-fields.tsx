"use client";

import { useState } from "react";
import { TagColorFields } from "./tag-color-fields";
import styles from "./tag-color-fields.module.css";

export function GroupTagCreationFields() {
  const [enabled, setEnabled] = useState(true);
  return <fieldset className={styles.form}>
    <legend>Group chat tag</legend>
    <label><input type="checkbox" name="tagEnabled" checked={enabled} onChange={event => setEnabled(event.target.checked)} /> Create and assign the group tag now</label>
    {enabled ? <><p>Leave tag text empty to use the new group's name. Members inherit this tag automatically.</p><TagColorFields textRequired={false} showSaveBar={false} /></> : null}
  </fieldset>;
}
