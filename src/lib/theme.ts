// Per-device display preference, not plan data -- lives in localStorage,
// never Supabase (see CLAUDE.md: "it should differ between my two
// machines"). Everything here is browser-only; nothing runs server-side.
export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "theme";

export function readStoredTheme(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

export function storeTheme(theme: ThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Blocked or full storage just means the choice won't persist this
    // time -- the page itself must still render with the right theme.
  }
}

export function resolveIsDark(theme: ThemePreference): boolean {
  return theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

export function applyTheme(theme: ThemePreference): void {
  document.documentElement.classList.toggle("dark", resolveIsDark(theme));
}

// Inlined into <head> (src/app/layout.tsx) as a blocking <script>, so the
// "dark" class lands on <html> before first paint -- a useEffect would
// run after React hydrates, late enough to flash the wrong theme. A
// script tag can't import this module, so the resolution logic above is
// deliberately mirrored here; keep the two in sync if it ever changes.
export const THEME_INIT_SCRIPT = `(function(){try{var v=localStorage.getItem(${JSON.stringify(STORAGE_KEY)});var t=(v==="light"||v==="dark")?v:"system";var dark=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(dark)document.documentElement.classList.add("dark");}catch(e){}})();`;
