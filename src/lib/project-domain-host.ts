/**
 * Hostname for logo/favicon services from user-entered domain
 * (e.g. "example.com", "https://www.example.com/path").
 */
export function projectDomainHost(raw: string): string {
  const s = (raw || "").trim();
  if (!s) return "";
  try {
    const url = /^https?:\/\//i.test(s) ? new URL(s) : new URL(`https://${s}`);
    return url.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return s
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0]
      ?.split("?")[0]
      ?.trim() ?? "";
  }
}
