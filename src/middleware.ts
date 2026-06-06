import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { adminPanelPathFromProjectsAdmin } from "@/lib/projects/reserved-project-slugs";

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
]);

const clerk = clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();
  const pathname = req.nextUrl.pathname;

  const isApiV1 = pathname.startsWith("/api/v1/");
  const isPublicWebhook = pathname.startsWith("/api/webhooks") || pathname.startsWith("/api/v1/webhooks");

  if (userId && isPublicRoute(req) && !pathname.startsWith("/api")) {
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
});

export default function middleware(...args: Parameters<typeof clerk>) {
  const req = args[0];
  const pathname = req.nextUrl.pathname;
  const lowerPathname = pathname.toLowerCase();

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
