import TurndownService from "turndown";

/**
 * Serializes a DOM Range from the visual blog editor to Markdown so hyperlinks
 * become `[label](url)` instead of being lost (as with Selection#toString()).
 */
export function rangeSelectionToMarkdown(range: Range): string {
  const container = document.createElement("div");
  container.appendChild(range.cloneContents());
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });
  return td.turndown(container.innerHTML).replace(/\n{3,}/g, "\n\n").trim();
}

/** Raw HTML for `cloneContents()` — optional context for link-aware AI rewrite. */
export function rangeSelectionHtmlFragment(range: Range): string {
  const container = document.createElement("div");
  container.appendChild(range.cloneContents());
  return container.innerHTML.trim();
}
