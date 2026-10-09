"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

// Server Action for the sign-out button. Clears the session cookies and ends
// this device's session on Supabase ("local" leaves other devices logged in).
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
