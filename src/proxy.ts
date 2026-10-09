import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isAllowedEmail } from "@/lib/allowed-email";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";

// Paths a logged-out visitor may open. Everything else redirects to /login.
const PUBLIC_PATHS = ["/login", "/auth/"];

// Runs before every matched request (see `config` below) and does two jobs:
// 1. Refreshes the Supabase session, writing renewed auth cookies to the response.
//    Server Components can't set cookies, so this is the only place it can happen
//    before a page renders.
// 2. Redirects logged-out visitors to /login, and logged-in ones away from it.
//    This is for convenience only. The real access check is getCurrentUser() on
//    the server, because a proxy can be misconfigured or skipped by a matcher.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        // Update the request too, so the page rendered after this proxy sees
        // the refreshed session rather than the expired one.
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        // No-cache headers, so a CDN never serves one person's session cookie to another.
        Object.entries(headers).forEach(([key, value]) =>
          response.headers.set(key, value),
        );
      },
    },
  });

  // Don't run code between createServerClient and this call: it's what triggers
  // the token refresh. getClaims() verifies the access token's signature;
  // getSession() would trust the cookie blindly.
  const { data } = await supabase.auth.getClaims();
  // A valid session for any other email counts as logged out. Otherwise
  // getCurrentUser() would send it to /login and this proxy straight back to /.
  const isLoggedIn = isAllowedEmail(data?.claims?.email);

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  if (!isLoggedIn && !isPublic) {
    return redirectKeepingCookies(request, response, "/login");
  }
  if (isLoggedIn && pathname === "/login") {
    return redirectKeepingCookies(request, response, "/");
  }

  return response;
}

// A redirect is a new response object, so copy over any auth cookies and
// headers the refresh just set; otherwise the browser would never receive them.
function redirectKeepingCookies(
  request: NextRequest,
  from: NextResponse,
  pathname: string,
) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  const redirect = NextResponse.redirect(url);
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  for (const key of ["cache-control", "expires", "pragma"]) {
    const value = from.headers.get(key);
    if (value) redirect.headers.set(key, value);
  }
  return redirect;
}

export const config = {
  matcher: [
    // Every path except Next's build assets, image optimizer, and static files
    // (favicon and anything ending in a common image extension).
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
