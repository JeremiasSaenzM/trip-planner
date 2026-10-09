// Public Supabase settings, safe for the browser.
// NEXT_PUBLIC_* values are inlined into the client bundle at build time, so they
// must be read with literal `process.env.NAME` expressions (no dynamic lookup).

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. " +
      "Set them in .env.local (and in Vercel), then restart the dev server.",
  );
}

// Must be the bare project URL. A copied API URL such as ".../rest/v1/" makes
// every Auth call fail with "Invalid path specified in request URL".
if (new URL(url).pathname !== "/") {
  throw new Error(
    `NEXT_PUBLIC_SUPABASE_URL must be just the project URL (https://<project-ref>.supabase.co), ` +
      `without a path like /rest/v1. Got path "${new URL(url).pathname}".`,
  );
}

export const supabaseUrl = url;
export const supabasePublishableKey = publishableKey;
