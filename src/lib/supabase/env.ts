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

export const supabaseUrl = url;
export const supabasePublishableKey = publishableKey;
