import "server-only";

import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import { isAllowedEmail } from "@/lib/allowed-email";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string;
};

// Data Access Layer: the one place that decides who the current user is.
// Every protected page, and every server-side data read, goes through this
// rather than trusting the proxy. Logged-out or not-allowed visitors are
// redirected to /login.
//
// It reads cookies, so with Cache Components any component calling it must
// render inside a <Suspense> boundary.
//
// React's cache() runs it at most once per request, however many components call it.
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  // Next.js can prerender cookie-dependent UI ahead of a request (for prefetching)
  // and reuse the result. Supabase checks token expiry with Date.now(), and a
  // clock reading can't be reused, so connection() pins this to the real request.
  await connection();

  const supabase = await createClient();

  // getClaims() verifies the access token's signature (against the project's
  // public signing keys) instead of trusting the cookie's contents.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims?.sub || !claims.email || !isAllowedEmail(claims.email)) {
    redirect("/login");
  }

  return { id: claims.sub, email: claims.email };
});
