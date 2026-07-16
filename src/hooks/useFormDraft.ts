"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  saveFormDraft,
  clearFormDraft,
  formDraftKey,
  type FormDraftKind,
  type FormDraft,
} from "@/lib/redux/form-drafts-slice";

/**
 * Persist a content-generator form so navigating away and back restores it.
 *
 *   const { clearDraft } = useFormDraft("blog", projectId, values, {
 *     enabled: phase === "form",
 *     apply: (d) => { setTopic(d.topic ?? ""); ... },
 *   });
 *
 * • `values` — the current draft object (rebuilt each render). Persisted
 *   (debounced) whenever it changes, once the initial restore has run.
 * • `apply` — restores a saved draft into local state. Runs once on mount if a
 *   draft exists. Restoring in an effect (not in useState initializers) keeps
 *   the SSR markup identical to the first client render → no hydration mismatch.
 * • `clearDraft` — wipes the stored draft (e.g. after a successful generation).
 */
export function useFormDraft<T extends FormDraft>(
  kind: FormDraftKind,
  projectId: string,
  values: T,
  opts: { enabled?: boolean; apply: (draft: T) => void; debounceMs?: number },
): { clearDraft: () => void; hadDraft: boolean } {
  const dispatch = useAppDispatch();
  const key = formDraftKey(kind, projectId);
  const stored = useAppSelector((s) => s.formDrafts.drafts[key]) as T | undefined;

  // Whether a non-empty draft existed at mount — stable for the component's life.
  const hadDraftRef = useRef(!!stored && Object.keys(stored).length > 0);

  const applyRef = useRef(opts.apply);
  applyRef.current = opts.apply;
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const storedAtMountRef = useRef(stored);
  const restoredRef = useRef(false);
  const debounceMs = opts.debounceMs ?? 400;

  // One-time restore on mount (client only) — avoids hydration mismatch.
  useEffect(() => {
    if (restoredRef.current) return;
    const d = storedAtMountRef.current;
    if (d && Object.keys(d).length > 0) applyRef.current(d);
    restoredRef.current = true;
  }, []);

  // Debounced persist whenever the draft changes (after restore has run).
  const serialized = JSON.stringify(values);
  useEffect(() => {
    if (!restoredRef.current) return;
    if (opts.enabled === false) return;
    const t = setTimeout(() => {
      dispatch(saveFormDraft({ kind, projectId, draft: valuesRef.current }));
    }, debounceMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized, opts.enabled, projectId, kind]);

  const clearDraft = useCallback(() => {
    dispatch(clearFormDraft({ kind, projectId }));
  }, [dispatch, kind, projectId]);

  return { clearDraft, hadDraft: hadDraftRef.current };
}
