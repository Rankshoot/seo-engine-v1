/** Shared text color for a Keyword Difficulty value, used by both keyword tables. */
export const KD_COLOR = (kd: number) =>
  kd < 30 ? "text-status-success" : kd < 60 ? "text-status-warning" : "text-brand-coral";
