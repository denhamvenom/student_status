/** The OAuth callback accepts only the two configured application entry points. */
export function allowedAuthRedirect(redirectTo: string, studentSite: string, timeclockSite?: string): string {
  if (redirectTo.startsWith("//") || Array.from(redirectTo).some(char => char === "\\" || char.charCodeAt(0) < 32)) throw new Error("Invalid authentication redirect");
  const student = new URL(studentSite);
  const timeclock = timeclockSite ? new URL(timeclockSite) : null;
  const target = new URL(redirectTo, student);
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.hash) {
    throw new Error("Invalid authentication redirect");
  }
  const studentPath = target.pathname === '/' || target.pathname === '/invite-parent';
  const timeclockPath = target.pathname === '/';
  if ((target.origin === student.origin && studentPath) || (timeclock && target.origin === timeclock.origin && timeclockPath)) {
    return target.href;
  }
  throw new Error("Invalid authentication redirect");
}
