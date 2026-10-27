import { menu, navigationCopy } from '@/lib/navigation-copy'
import { uiCopy } from '@/lib/ui-copy'
import { readinessCopy } from '@/features/design-review/readinessCopy'

/** Student menu, in order: Home, Events, Money, Attendance, Profile, Parents, Settings. */
export const studentNavItems = menu.student.map(([label, path]) => ({ label, path }))

/** Phone bottom bar; everything else is in the More sheet. */
export const studentBarPaths: readonly string[] = ['/', '/events', '/finances', '/profile']

export const studentShellCopy = {
  product: uiCopy.brand.product,
  team: 'Team 8044',
  more: navigationCopy.groups.more,
  darkMode: uiCopy.theme.dark,
  signOut: navigationCopy.groups.signOut,
  profile: navigationCopy.labels.profileHealth,
  development: readinessCopy.development,
  main: navigationCopy.main,
  mobile: navigationCopy.mobile,
  moreNavigation: navigationCopy.more,
  account: uiCopy.navigation.account,
  switchRole: 'Switch role', // Same label as RoleSwitchButton (docs/LANGUAGE.md, Parent with staff access).
} as const

/** The menu item a page belongs to: event detail and rooming stay under Events; /setup and unknown pages match nothing. */
export function studentNavPath(pathname: string): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  if (path === '/events' || path.startsWith('/events/')) return '/events'
  return studentNavItems.some(item => item.path === path) ? path : null
}

/** Up to two initials for the avatar: first letter of the first and last word ("Dev Student" → "DS"). */
export function initials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).map(word => word.match(/[\p{L}\p{N}]/u)?.[0] ?? '').filter(Boolean)
  if (words.length === 0) return ''
  const letters = words.length === 1 ? [words[0]] : [words[0], words[words.length - 1]]
  return letters.join('').toLocaleUpperCase('en-US')
}
