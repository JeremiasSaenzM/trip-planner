import type { EmailOtpType } from "@supabase/supabase-js";
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
    if (error) console.error("auth/callback: code exchange failed:", error.code);
    ok = !error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (error) console.error("auth/callback: OTP verification failed:", error.code);
    ok = !error;
  }

  // Session cookies set by the Supabase client above are attached to this
  // response automatically, because they were written through next/headers cookies().
  const target = request.nextUrl.clone();
  target.search = "";
  target.pathname = ok ? "/" : "/login";
  if (!ok) target.searchParams.set("error", "link");
  return NextResponse.redirect(target);
}
