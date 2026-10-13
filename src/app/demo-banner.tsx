import { isDemoMode } from "@/lib/demo-mode";

// Rendered unconditionally from the root layout so it's on every page,
// including /login -- it just renders nothing outside demo mode.
export function DemoBanner() {
  if (!isDemoMode()) return null;

  return (
    <div className="bg-amber-400 px-4 py-1.5 text-center text-sm font-medium text-amber-950 dark:bg-amber-600 dark:text-amber-50">
      Demo data — not real
    </div>
  );
}
