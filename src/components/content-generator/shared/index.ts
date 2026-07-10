/**
 * Shared Content Studio surface — single import for every type-specific page.
 *
 *   import {
 *     ContentForm, ContentFormSection, ContentFormGrid, ChipChoice, KeywordChips,
 *     SectionHeading, StudioBreadcrumb, StepRow, MetricPill, ContentTypeBadge,
 *     GenerationProgress,
 *     PreviewShell, ViewModePill, ReadOnlyArticle, InlineMarkdownEditor,
 *     LongFormMarkdown, stripHeroH1,
 *     EbookScorePanel, WhitepaperScorePanel, LinkedInScorePanel,
 *     ResourcesPanel, ExportMenu,
 *   } from "@/components/content-generator/shared";
 */

export {
  SectionHeading,
  StudioBreadcrumb,
  StepRow,
  MetricPill,
  ContentTypeBadge,
  RecentHistorySkeleton,
} from "./section-helpers";
export { GenerationProgress } from "./GenerationProgress";
export type { GenerationStage } from "./GenerationProgress";
export { ThinkingPanel } from "./ThinkingPanel";

export { LongFormMarkdown, stripHeroH1 } from "./LongFormMarkdown";
export type { LongFormMarkdownProps, LongFormReaderInk } from "./LongFormMarkdown";
export { StudioBrandMasthead } from "./StudioBrandMasthead";
export type { StudioBrandMastheadProps } from "./StudioBrandMasthead";
export { MarkdownFormatToolbar } from "./MarkdownFormatToolbar";
export type { MarkdownFormatToolbarProps } from "./MarkdownFormatToolbar";
export { KeywordChips } from "./KeywordChips";
export {
  ContentForm,
  ContentFormSection,
  ContentFormGrid,
  ChipChoice,
} from "./ContentForm";

export { PreviewShell, ViewModePill } from "./PreviewShell";
export type { PreviewShellProps, PreviewMode } from "./PreviewShell";
export { ReadOnlyArticle, InlineMarkdownEditor } from "./InlineMarkdownEditor";

export { EbookScorePanel } from "./EbookScorePanel";
export { WhitepaperScorePanel } from "./WhitepaperScorePanel";
export { LinkedInScorePanel } from "./LinkedInScorePanel";
export { ScorecardView } from "./ScorecardView";

export { ResourcesPanel } from "./ResourcesPanel";
export { ExportMenu } from "./ExportMenu";
export type { ExportMenuProps } from "./ExportMenu";
export { PreviewerScheduler } from "./PreviewerScheduler";
export { AskAiButton, TopicSuggestionChips, useAiFillTracker } from "./AskAiAssist";
export { AiEditPanel } from "./AiEditPanel";
export type { AiEditPanelProps } from "./AiEditPanel";
export * from "./validation";

