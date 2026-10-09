import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { supabasePublishableKey, supabaseUrl } from "./env";

// Supabase client for Server Components, Server Actions and Route Handlers.
// Create a new one per request; never share it between requests.
// (src/proxy.ts builds its own client, because it works on NextRequest/NextResponse.)
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // The second argument (no-cache headers) is ignored here: Server Actions
        // and Route Handlers aren't CDN-cached, and src/proxy.ts sets those
        // headers on the responses where a session refresh happens.
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components can't set cookies. That's fine as long as the
          // proxy refreshes the session before the page renders.
        }
      },
    },
  });
}
