export function fundraisingSplit(grossCents: number, studentBps: number, teamBps: number) {
  if (!Number.isSafeInteger(grossCents) || grossCents < 0 || !Number.isSafeInteger(studentBps) || !Number.isSafeInteger(teamBps) || studentBps < 0 || teamBps < 0 || studentBps + teamBps !== 10000) throw new Error("Enter exact cents and a split totaling 100%.");
  const travelCreditCents = Number(BigInt(grossCents) * BigInt(studentBps) / 10000n);
  return { grossCents, travelCreditCents, teamCents: grossCents - travelCreditCents };
}

export function fundraisingCapabilities(actor: { role: string; travelLead: boolean; financialEdit: boolean }) {
  return { canCreate: actor.role === "coach", canChangePolicy: actor.role === "coach", canPost: actor.role === "coach" || actor.role === "mentor" && actor.travelLead && actor.financialEdit };
}
