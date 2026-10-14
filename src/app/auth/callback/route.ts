import type { AuthError, EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

// The magic link lands here after Supabase has checked it.
//
// Today (default email template): Supabase redirects with `?code=...` (PKCE flow).
// The code is exchanged for a session using the code-verifier cookie that was
// set when the link was requested, so it only works in that same browser.
//
// Later (custom SMTP + custom template): the link carries `?token_hash=...&type=email`
// instead, which is verified directly and works in any browser.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const flowId = searchParams.get("sb_flow_id");

  const supabase = await createClient();
  let ok = false;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(
      code,
      flowId ? { flowId } : undefined,
    );
    if (error) logAuthError("code exchange failed", error);
    ok = !error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (error) logAuthError("OTP verification failed", error);
    ok = !error;
  }

  // Session cookies set by the Supabase client above are attached to this
  // response automatically, because they were written through next/headers cookies().
  //
  // A relative Location header, not an absolute URL built from
  // request.url/nextUrl: self-hosted (next start, no reverse proxy in
  // front), neither reliably tracks the Host header actually used for
  // this request -- a request to http://127.0.0.1:3000 was observed
  // coming back out as a redirect to http://localhost:3000, a different
  // origin with no session cookie, which bounced straight back to
  // /login even though the code exchange itself had already succeeded.
  // A relative Location resolves against the request's own origin by
  // definition (RFC 3986 §5.1), so there's no origin left to get wrong.
  const location = ok ? "/" : "/login?error=link";
  return new NextResponse(null, { status: 307, headers: { Location: location } });
}

// Server-side only; the browser just sees /login?error=link.
function logAuthError(what: string, error: AuthError) {
  console.error(`auth/callback: ${what}:`, {
    status: error.status,
    code: error.code,
    message: error.message,
  });
}
