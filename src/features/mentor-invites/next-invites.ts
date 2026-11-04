// Which invitations a Mentor sees first on Home: upcoming, not canceled or declined, soonest first.
export type InviteTiming = { startsAt: number; endsAt: number; cancelled: boolean; status?: string }

export function nextInvites<T extends InviteTiming>(invites: readonly T[], now: number, limit = 3): T[] {
  return invites.filter(invite => !invite.cancelled && invite.status !== 'declined' && invite.endsAt >= now).sort((a, b) => a.startsAt - b.startsAt).slice(0, limit)
}
