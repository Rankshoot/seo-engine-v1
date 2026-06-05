"use client";

import React, { useMemo } from "react";
import type { KeywordStatus } from "@/lib/types";
import { StatusActionDropdown } from "@/components/common/StatusActionDropdown";

const STATUS_LABEL: Record<KeywordStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const TRIGGER_BASE =
  "inline-flex min-w-[7.5rem] items-center justify-between gap-2 rounded-[8px] border px-2.5 py-1.5 text-[11px] font-bold capitalize outline-none transition-colors focus-visible:ring-1 focus-visible:ring-brand-action/40 disabled:opacity-50";

const STATUS_TRIGGER: Record<KeywordStatus, string> = {
  approved: "border-brand-action/30 bg-brand-action/10 text-brand-action",
  rejected: "border-brand-coral/30 bg-brand-coral/10 text-brand-coral",
  pending: "border-border-subtle bg-surface-secondary text-text-tertiary",
};

type Props = {
  status: KeywordStatus;
  busy?: boolean;
  onChange: (next: KeywordStatus) => void;
};

export const KeywordActionDropdown = React.memo(function KeywordActionDropdown({ status, busy, onChange }: Props) {
  const items = useMemo(() => {
    const statuses: KeywordStatus[] = ["pending", "approved", "rejected"];
    return statuses.map(s => ({
      key: s,
      label: STATUS_LABEL[s],
      selected: s === status,
      onSelect: () => {
        if (s !== status) onChange(s);
      },
    }));
  }, [status, onChange]);

  return (
    <StatusActionDropdown
      keywordActionMarker
      triggerLabel={STATUS_LABEL[status]}
      triggerClassName={`${TRIGGER_BASE} ${STATUS_TRIGGER[status]}`}
      busy={busy}
      ariaLabel={`Keyword status: ${STATUS_LABEL[status]}`}
      items={items}
    />
  );
});
