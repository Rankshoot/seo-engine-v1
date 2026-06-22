import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { adminPanelPathFromProjectsAdmin } from "@/lib/projects/reserved-project-slugs";
import { isClerkKeyValid } from "@/lib/clerk-keys";

// Edge-native in-memory rate limit cache
const rateLimitCache = new Map<string, number[]>();

function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const timestamps = rateLimitCache.get(key) || [];
  
  // Clean up expired timestamps
  const validTimestamps = timestamps.filter(t => now - t < windowMs);
  
  if (validTimestamps.length >= limit) {
    rateLimitCache.set(key, validTimestamps);
    return true;
  }
  
  validTimestamps.push(now);
  rateLimitCache.set(key, validTimestamps);
  return false;
}


async function fetchApprovalStatus(userId: string): Promise<"approved" | "pending"> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return "approved";

  const db = createClient(url, key);
  const { data } = await db
    .from("user_approvals")
    .select("status")
    .eq("clerk_user_id", userId)
    .single();

  const status = (data as { status: string } | null)?.status ?? null;

  if (status === "approved") return "approved";

  if (status === "pending" || status === "denied" || status === "revoked") {
    return "pending";
  }

  // No record at all — insert pending and block.
  // Existing grandfathered users already have 'approved' from the migration script.
  // Any user without a record is therefore new and must wait for approval.
  await db.from("user_approvals").upsert(
    {
      clerk_user_id: userId,
      email: "",
      status: "pending",
      requested_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "clerk_user_id" }
  );
  return "pending";
}

const clerkEnabled = isClerkKeyValid(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/pending-approval(.*)",
  "/api/webhooks(.*)",
]);

const isApprovalBypassRoute = createRouteMatcher([
  "/pending-approval(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
  "/api/v1/admin(.*)",
  "/api/v1/me/approval-status(.*)",
]);

const clerk = clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();
  const pathname = req.nextUrl.pathname;

  const isApiV1 = pathname.startsWith("/api/v1/");
  const isPublicWebhook = pathname.startsWith("/api/webhooks") || pathname.startsWith("/api/v1/webhooks");

  if (userId && isPublicRoute(req) && !pathname.startsWith("/api") && pathname !== "/pending-approval") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Securely protect all /api/v1/* routes globally (except public webhooks)
  if (isApiV1 && !isPublicWebhook) {
    if (!userId) {
      return new NextResponse(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
  }

  const isApi = pathname.startsWith("/api/");
  if (!isPublicRoute(req) && !isApi) {
    await auth.protect();
  }

  // Approval gate — real-time DB check (sessionClaims are stale until token rotation)
  if (userId && !isApi && !isApprovalBypassRoute(req)) {
    const status = await fetchApprovalStatus(userId);
    if (status === "pending") {
      return NextResponse.redirect(new URL("/pending-approval", req.url));
    }
  }
});

export default function middleware(...args: Parameters<typeof clerk>) {
  const req = args[0];
  const pathname = req.nextUrl.pathname;
  const lowerPathname = pathname.toLowerCase();

  // Edge-native Rate Limiting to prevent API abuse
  if (pathname.startsWith("/api/")) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || 
               req.headers.get("x-real-ip") || 
               "127.0.0.1";

    const isGenerationApi = pathname.includes("/generate") || 
                             pathname.includes("/enhance") || 
                             pathname.includes("/deep-analysis");
    
    // AI generation APIs are limited to 10 req/min; others to 100 req/min
    const limit = isGenerationApi ? 10 : 100;
    const windowMs = 60 * 1000;

    if (isRateLimited(`${ip}:${isGenerationApi ? "gen" : "api"}`, limit, windowMs)) {
      return new NextResponse(
        JSON.stringify({
          success: false,
          error: "Too Many Requests",
          message: "You have exceeded your request rate limit. Please try again in a minute.",
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "60",
          },
        }
      );
    }
  }

  // Backward-compatible project URL aliases:
  //   /project/:id/...  -> /projects/:id/...
  //   /PROJECT/:id/...  -> /projects/:id/...
  //   /Projects/:id/... -> /projects/:id/...
  // Next routes are case-sensitive, so normalize these before Clerk/App Router.
  if (lowerPathname === "/project" || lowerPathname.startsWith("/project/")) {
    const url = req.nextUrl.clone();
    url.pathname = `/projects${pathname.slice("/project".length)}`;
    return NextResponse.redirect(url);
  }

  if (lowerPathname === "/projects" || lowerPathname.startsWith("/projects/")) {
    const adminRedirect = adminPanelPathFromProjectsAdmin(pathname);
    if (adminRedirect) {
      const url = req.nextUrl.clone();
      url.pathname = adminRedirect;
      return NextResponse.redirect(url);
    }

    const canonical = `/projects${pathname.slice("/projects".length)}`;
    if (pathname !== canonical) {
      const url = req.nextUrl.clone();
      url.pathname = canonical;
      return NextResponse.redirect(url);
    }
  }

  if (!clerkEnabled) {
    return NextResponse.next();
  }
  return clerk(...args);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
