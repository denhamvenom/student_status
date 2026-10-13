import { retentionCopy } from './retention-copy'
import reference from './ui-copy.reference.json'
import { readinessCopy } from '../features/design-review/readinessCopy'

const student = reference.navigation.desktop.student
const parent = reference.navigation.desktop.parent
const coach = reference.navigation.desktop.coachGroups as [string, string[]][]
const travel = reference.navigation.desktop.travelLeadGroups as [string, string[]][]
const mentor = reference.navigation.desktop.mentor

export const navigationCopy = {
  groups: readinessCopy.navigation,
  labels: {
    status: student[0], events: student[1], finances: student[2], attendance: student[3],
    profileHealth: student[4], parents: student[5], settings: student[6],
    permissionForm: parent[5], team: coach[0][1][0], joinRequests: coach[0][1][1],
    usersRoles: coach[0][1][2], readiness: coach[1][1][1], drivers: coach[1][1][2],
    permissionForms: coach[1][1][3], fundraising: coach[2][1][1], reports: coach[3][1][0],
    season: coach[4][1][1], myProfile: travel[4][1][0], teamReport: mentor[0],
    withdrawals: readinessCopy.navigation.withdrawals,
  },
  main: 'Main navigation', mobile: 'Mobile navigation', more: 'More navigation',
  subSuffix: 'navigation', travelLeadRole: 'Travel Lead',
} as const

const n = navigationCopy.labels
export const menu: Record<string, [string, string][]> = {
  student: [[n.status,'/'],[n.events,'/events'],[n.finances,'/finances'],[n.attendance,'/attendance'],[n.profileHealth,'/profile'],[n.parents,'/parents'],[n.settings,'/settings']],
  parent: [[n.status,'/'],[n.events,'/events'],[n.finances,'/finances'],[n.attendance,'/attendance'],[n.profileHealth,'/profile'],[n.permissionForm,'/forms'],[n.settings,'/settings']],
  coach: [[n.team,'/'],[n.events,'/events'],[n.readiness,'/readiness'],[n.withdrawals,'/withdrawals'],[n.drivers,'/drivers'],[n.finances,'/finances'],[n.fundraising,'/fundraising'],[n.permissionForms,'/permissions'],[n.reports,'/reports'],[n.joinRequests,'/enroll'],[n.usersRoles,'/adults'],[n.attendance,'/attendance'],[n.season,'/season'],[retentionCopy.title,'/retention'],[n.settings,'/settings']],
  travelLead: [[n.team,'/'],[n.events,'/events'],[n.readiness,'/readiness'],[n.withdrawals,'/withdrawals'],[n.drivers,'/drivers'],[n.finances,'/finances'],[n.fundraising,'/fundraising'],[n.permissionForms,'/permissions'],[n.reports,'/reports'],[n.myProfile,'/myprofile'],[n.settings,'/settings']],
  mentor: [[n.teamReport,'/'],[n.myProfile,'/myprofile'],[n.settings,'/settings']],
}
