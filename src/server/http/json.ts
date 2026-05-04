import { NextResponse } from "next/server";

/** Single JSON object — readable in DevTools (not RSC / server-action wire). */
export function apiJson<T>(body: T, init?: { status?: number; headers?: HeadersInit }) {
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(init?.headers ?? {}),
    },
  });
}
