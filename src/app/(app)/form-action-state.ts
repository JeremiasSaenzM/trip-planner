// Shared between bootstrap-actions.ts (a "use server" module, which can
// only export async functions -- not this type or constant) and the
// client form components that call those actions through useActionState.
export type FormActionState = { status: "idle" } | { status: "error"; message: string };

export const initialFormActionState: FormActionState = { status: "idle" };
