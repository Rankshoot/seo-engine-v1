/** Base path for versioned JSON APIs (readable in Network → Response). */
export const API_V1 = "/api/v1";

function resolveUrl(path: string): string {
  const relPath = `${API_V1}${path}`;
  if (typeof window !== "undefined") {
    return relPath;
  }
  // Server-side: resolve to absolute URL using NEXT_PUBLIC_APP_URL or fallback localhost
  const host = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 3000}`;
  return `${host.replace(/\/$/, "")}${relPath}`;
}

export async function readApiJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 240)}`);
  }
}

export async function apiGet<T = unknown>(path: string): Promise<T> {
  const url = resolveUrl(path);
  const res = await fetch(url, { credentials: "same-origin" });
  return readApiJson<T>(res);
}

export async function apiPost<T = unknown>(path: string, body?: unknown): Promise<T> {
  const url = resolveUrl(path);
  const res = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return readApiJson<T>(res);
}

export async function apiPatch<T = unknown>(path: string, body: unknown): Promise<T> {
  const url = resolveUrl(path);
  const res = await fetch(url, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readApiJson<T>(res);
}

export async function apiDelete<T = unknown>(path: string): Promise<T> {
  const url = resolveUrl(path);
  const res = await fetch(url, { method: "DELETE", credentials: "same-origin" });
  return readApiJson<T>(res);
}
