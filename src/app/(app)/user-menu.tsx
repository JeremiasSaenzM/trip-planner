import { getCurrentUser } from "@/lib/auth";

import { signOut } from "./actions";

// Reads the session, so the layout renders it inside <Suspense>.
export async function UserMenu() {
  const user = await getCurrentUser();

  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="hidden truncate text-sm text-zinc-600 sm:inline dark:text-zinc-400">
        {user.email}
      </span>
      {/* A plain <form> with a Server Action works even before JavaScript loads. */}
      <form action={signOut}>
        <button
          type="submit"
          className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
