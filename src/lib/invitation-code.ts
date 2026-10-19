// Five digits request an individual account connection; six digits request team membership.
// Keep previously issued prefixed individual invitations working.
export function isIndividualInvitation(value: string): boolean {
  const code = value.trim()
  return /^\d{1,5}$/.test(code) || code.toUpperCase().startsWith('DV-')
}

export function isValidIndividualInvitation(value: string): boolean {
  return /^\d{5}$/.test(value.trim()) || /^DV-[0-9A-F]{32}$/i.test(value.trim())
}
