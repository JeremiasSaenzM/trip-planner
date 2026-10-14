// Shared Tailwind tokens and the error paragraph every form in this
// directory uses (bootstrap-forms.tsx, savings-entries-ui.tsx, ...), so
// a new form reaches for the same look rather than re-deriving it.

export const inputClass =
  "block w-full rounded-lg border border-zinc-300 bg-white px-3 py-3 text-base outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-300";
export const labelClass = "block text-sm font-medium";
export const buttonClass =
  "w-full rounded-lg bg-zinc-900 px-4 py-3 text-base font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900";
export const secondaryButtonClass =
  "w-full rounded-lg border border-zinc-300 px-4 py-3 text-base font-medium disabled:opacity-60 dark:border-zinc-700";

export function FormError({ message }: { message: string }) {
  return (
    <p role="alert" className="text-sm text-red-600 dark:text-red-400">
      {message}
    </p>
  );
}
