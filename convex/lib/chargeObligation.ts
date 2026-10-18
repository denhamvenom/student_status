import type { Doc } from "../_generated/dataModel";

/** Original charge amounts remain immutable; corrections and cancellations are explicit deltas. */
export function effectiveChargeCents(charge: Pick<Doc<"charges">, "amountCents" | "adjustedCents" | "cancelledCents" | "appliedCents">) {
  const adjusted = charge.adjustedCents ?? 0;
  const cancelled = charge.cancelledCents ?? 0;
  const revised = charge.amountCents + adjusted;
  const effective = revised - cancelled;
  if (!Number.isSafeInteger(charge.amountCents) || charge.amountCents < 0 || !Number.isSafeInteger(adjusted) || !Number.isSafeInteger(cancelled) || cancelled < 0 || !Number.isSafeInteger(revised) || revised < 0 || !Number.isSafeInteger(effective) || effective < 0 || !Number.isSafeInteger(charge.appliedCents) || charge.appliedCents < 0 || charge.appliedCents > effective) throw new Error("Charge balance is inconsistent.");
  return effective;
}
