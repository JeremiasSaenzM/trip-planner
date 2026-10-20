import { z } from "zod";

import { changeReason, id } from "./shared";

// The /import review screen's own inputs. The pasted batch itself is
// validated by src/lib/proposals/schema.ts -- these only cover the
// buttons around it.

export const approveProposalInput = z.object({ itemId: id });

// cascade: also reject every pending item that depends on this one.
// Without it they stay pending, shown as blocked -- either way nothing
// is dropped without a recorded decision.
export const rejectProposalInput = z.object({
  itemId: id,
  reason: changeReason,
  cascade: z.boolean(),
});

export const approveAllReadyInput = z.object({ batchId: id });

export const closeProposalBatchInput = z.object({
  batchId: id,
  reason: changeReason,
});
