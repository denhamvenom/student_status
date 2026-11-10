/**
 * Whether the setup gate should send this account to /setup on load. Parents are never sent: an unfinished Parent
 * setup shows on Home as a "Finish setup" card that opens the same wizard (owner decision, November 10, 2026), and
 * /setup still works as a link. Students still land on /setup until their profile is done.
 */
export function shouldRedirectToSetup(input: { pathname: string; needsSetup: boolean; role: string | undefined }) {
  if (input.pathname === '/setup' || !input.needsSetup) return false
  return input.role !== 'parent'
}
