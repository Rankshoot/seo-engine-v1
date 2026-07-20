import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

/**
 * Form-draft persistence — keeps the content-generator forms (blog, whitepaper,
 * ebook, LinkedIn) intact when the user navigates away mid-fill and comes back.
 *
 * The store persists this slice to localStorage (see `store.ts`), so a draft
 * also survives a hard refresh. Only *user-entered* fields are stored — never
 * transient state (loading flags, stream text, fetched competitor pages).
 *
 * Design: one generic bag keyed by `${kind}:${projectId}` holding an arbitrary
 * record. That avoids a bespoke slice per form type (no duplication) while each
 * page owns the shape of its own draft.
 */
export type FormDraftKind = "blog" | "whitepaper" | "ebook" | "linkedin";

export type FormDraft = Record<string, unknown>;

export interface FormDraftsState {
  drafts: Record<string, FormDraft>;
}

const initialState: FormDraftsState = { drafts: {} };

export function formDraftKey(kind: FormDraftKind, projectId: string): string {
  return `${kind}:${projectId}`;
}

export const formDraftsSlice = createSlice({
  name: "formDrafts",
  initialState,
  reducers: {
    saveFormDraft(
      state,
      action: PayloadAction<{ kind: FormDraftKind; projectId: string; draft: FormDraft }>,
    ) {
      state.drafts[formDraftKey(action.payload.kind, action.payload.projectId)] =
        action.payload.draft;
    },
    clearFormDraft(
      state,
      action: PayloadAction<{ kind: FormDraftKind; projectId: string }>,
    ) {
      delete state.drafts[formDraftKey(action.payload.kind, action.payload.projectId)];
    },
  },
});

export const { saveFormDraft, clearFormDraft } = formDraftsSlice.actions;
