import reference from './ui-copy.reference.json'
import { readinessCopy } from '../features/design-review/readinessCopy'

const student = reference.navigation.desktop.student
const coach = reference.navigation.desktop.coachGroups as [string, string[]][]

export const navigationCopy = {
  groups: readinessCopy.navigation,
  labels: {
    status: 'Home', events: student[1], finances: 'Money', attendance: student[3],
    profileHealth: 'Profile', studentProfile: 'Student profile', parents: student[5], settings: student[6],
    permissionForm: 'Forms', team: coach[0][1][0], joinRequests: coach[0][1][1],
    usersRoles: readinessCopy.navigation.users, readiness: readinessCopy.navigation.readiness, drivers: coach[1][1][2],
    permissionForms: coach[1][1][3], fundraising: coach[2][1][1], reports: readinessCopy.navigation.reports,
    season: coach[4][1][1], myProfile: 'Profile', teamReport: 'Report',
    withdrawals: readinessCopy.navigation.withdrawals,
  },
  main: 'Main navigation', mobile: 'Mobile navigation', more: 'More navigation',
  subSuffix: 'navigation', travelLeadRole: 'Travel Lead',
} as const

const n = navigationCopy.labels
export const menu: Record<string, [string, string][]> = {
  student: [[n.status,'/'],[n.events,'/events'],[n.finances,'/finances'],[n.attendance,'/attendance'],[n.profileHealth,'/profile'],[n.parents,'/parents'],[n.settings,'/settings']],
  parent: [[n.status,'/'],[n.events,'/events'],[n.finances,'/finances'],[n.attendance,'/attendance'],[n.studentProfile,'/profile'],[n.permissionForm,'/forms'],[n.settings,'/settings']],
  coach: [[n.team,'/'],[n.events,'/events'],[n.readiness,'/readiness'],[n.withdrawals,'/withdrawals'],[n.drivers,'/drivers'],[n.finances,'/finances'],[n.fundraising,'/fundraising'],[n.permissionForms,'/permissions'],[n.reports,'/reports'],[n.joinRequests,'/enroll'],[n.usersRoles,'/adults'],[readinessCopy.navigation.attendance,'/attendance'],[n.season,'/season'],['Money tools','/money-tools'],[readinessCopy.navigation.archived,'/retention'],[n.myProfile,'/myprofile'],[n.settings,'/settings']],
  travelLead: [[n.team,'/'],[n.joinRequests,'/enroll'],[n.events,'/events'],[n.readiness,'/readiness'],[n.withdrawals,'/withdrawals'],[n.drivers,'/drivers'],[n.finances,'/finances'],[n.fundraising,'/fundraising'],[n.permissionForms,'/permissions'],[n.reports,'/reports'],['Money tools','/money-tools'],[n.myProfile,'/myprofile'],[n.settings,'/settings']],
  mentor: [[n.teamReport,'/'],[n.myProfile,'/myprofile'],[n.settings,'/settings']],
}

export function staysOnCurrentGroup(pathname: string, groupPaths: readonly string[]): boolean {
  return groupPaths.some(path => pathname === path || (path === '/events' && pathname.startsWith('/events/')) || (path === '/' && (pathname === '/team' || pathname.startsWith('/team/'))))
}
