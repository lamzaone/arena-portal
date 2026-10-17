"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export const SearchSubmissionContext = createContext<Set<() => void> | null>(null);

function signature(value: string | Record<string, string>) {
  return JSON.stringify(typeof value === "string" ? value.trim() :
    Object.keys(value).sort().map(key => [key, value[key].trim()]));
}

/** Keep local edits when an earlier search returns; still adopt external navigation. */
export function useSearchDraft<T extends string | Record<string, string>>(serverValue: T, submittedValue?: (draft: T) => T) {
  const [draft, setDraft] = useState(serverValue);
  const draftRef = useRef(draft);
  const serverRef = useRef(serverValue);
  const submissionRef = useRef(draft);
  const submitted = useRef(new Set<string>());
  const listeners = useContext(SearchSubmissionContext);
  draftRef.current = draft;
  serverRef.current = serverValue;
  submissionRef.current = submittedValue ? submittedValue(draft) : draft;
  const serverKey = signature(serverValue);

  const recordSubmission = useCallback(() => {
    submitted.current.add(signature(submissionRef.current));
  }, []);

  const reset = useCallback((value: T) => {
    submitted.current.clear();
    setDraft(value);
  }, []);

  useEffect(() => {
    if (submitted.current.has(serverKey)) {
      // A response acknowledges a submitted snapshot, not the current input.
      if (signature(draftRef.current) === serverKey) submitted.current.clear();
      return;
    }
    reset(serverRef.current);
  }, [serverKey, reset]);

  useEffect(() => {
    listeners?.add(recordSubmission);
    return () => { listeners?.delete(recordSubmission); };
  }, [listeners, recordSubmission]);

  useEffect(() => {
    const restore = () => reset(serverRef.current);
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [reset]);

  return { draft, setDraft, recordSubmission, reset };
}
