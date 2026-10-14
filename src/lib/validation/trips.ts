import { z } from "zod";

// The hosted database starts out completely empty -- this is the form
// behind the Overview page's "no_trip" empty state.
export const createTripInput = z.object({
  name: z.string().trim().min(1, "Name your trip"),
});

export type CreateTripInput = z.infer<typeof createTripInput>;
