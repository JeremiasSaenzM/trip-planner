"use server";

import { headers } from "next/headers";

import { isAllowedEmail } from "@/lib/allowed-email";
import { createClient } from "@/lib/supabase/server";

export type LoginState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string };

// Server Action: runs on the server when the login form is submitted.
// The browser only ever sees the returned LoginState, never this code or ALLOWED_EMAIL.
export async function sendMagicLink(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email.includes("@")) {
    return { status: "error", message: "Enter a valid email address." };
  }

  // Answer exactly as if the link was sent, so the form never reveals which
  // address is allowed. No email goes out and Supabase is never called.
  if (!isAllowedEmail(email)) {
    console.warn("login: rejected an email that is not ALLOWED_EMAIL");
    return { status: "sent", email };
  }

  // Send the link back to whichever site the form was submitted from
  // (localhost or Vercel). Supabase only honors it if it's in the
  // Redirect URLs allowlist; otherwise it falls back to the Site URL.
  const origin = (await headers()).get("origin");
  if (!origin) {
    return { status: "error", message: "Couldn't determine this site's address." };
  }

  // Using the server client stores the PKCE code-verifier cookie in this browser,
  // which /auth/callback needs to finish the login.
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    console.error("login: signInWithOtp failed:", error.code, error.message);
    if (error.code === "over_email_send_rate_limit" || error.status === 429) {
      return {
        status: "error",
        message:
          "Too many login emails. Supabase's free sender allows only a few per hour, so wait and try again.",
      };
    }
    return { status: "error", message: "Couldn't send the login link. Try again." };
  }

  return { status: "sent", email };
}
