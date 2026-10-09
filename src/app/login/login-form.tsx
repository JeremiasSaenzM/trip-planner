"use client";

import { useActionState } from "react";

import { sendMagicLink, type LoginState } from "./actions";

const initialState: LoginState = { status: "idle" };

export function LoginForm() {
  // useActionState calls the Server Action on submit and gives back its latest
  // result (state) plus a pending flag while the request is in flight.
  const [state, formAction, pending] = useActionState(sendMagicLink, initialState);

  if (state.status === "sent") {
    return (
      <div role="status" className="space-y-3">
        <p className="text-base">
          If <strong className="break-all">{state.email}</strong> is allowed, a
          login link is on its way.
        </p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Open it in <strong>this same browser</strong>. On a phone, long-press
          the link in your mail app and choose to open it in the browser you&apos;re
          using now.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        {/* text-base (16px) stops iOS Safari from zooming in when the field is focused. */}
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-3 text-base outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-300"
        />
      </div>

      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-zinc-900 px-4 py-3 text-base font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "Sending…" : "Email me a login link"}
      </button>
    </form>
  );
}
