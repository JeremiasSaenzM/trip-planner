import { createBrowserClient } from "@supabase/ssr";

import { supabasePublishableKey, supabaseUrl } from "./env";

// Supabase client for Client Components ("use client").
// It reads and writes the same auth cookies as the server client, via document.cookie.
export function createClient() {
  return createBrowserClient(supabaseUrl, supabasePublishableKey);
}
