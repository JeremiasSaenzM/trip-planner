// The one email address allowed to use this app, from the server-only
// ALLOWED_EMAIL env var (never NEXT_PUBLIC_, so it stays out of the browser).
// Used by the login action, the proxy, and getCurrentUser().

export function isAllowedEmail(email: string | null | undefined): boolean {
  const allowed = process.env.ALLOWED_EMAIL?.trim().toLowerCase();
  if (!allowed) {
    throw new Error(
      "Missing ALLOWED_EMAIL. Set it in .env.local (and in Vercel), then restart the dev server.",
    );
  }
  return email?.trim().toLowerCase() === allowed;
}
