import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/token";

/**
 * Route proxy: fast pre-check for protected areas. It only verifies the cookie SIGNATURE and expiry,
 * and the role claim for /admin. The authoritative checks (user still exists, not suspended,
 * token not revoked, permission per action) happen in the server layer — see lib/auth/guards.ts.
 */
export function proxy(req: NextRequest) {
  const claims = verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const { pathname, search } = req.nextUrl;

  if (!claims) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  if (pathname.startsWith("/admin") && claims.role !== "ADMIN") {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*", "/courses/:path*", "/platform/:path*", "/subject/:slug/topic/:path*", "/topic/:path*", "/test/:path*",
    "/exams/:path*", "/progress/:path*", "/ranking/:path*", "/notes/:path*", "/mistakes/:path*", "/certificates/:path*", "/payments/:path*",
    "/notifications/:path*", "/profile/:path*", "/admin/:path*",
  ],
};
