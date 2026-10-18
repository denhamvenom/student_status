export type Role = 'student' | 'parent' | 'coach' | 'travelLead' | 'mentor'
export type Status = 'Ready' | 'Open' | 'Pending' | 'Waitlist' | 'Done' | 'Not applicable'

export interface EventView { id: string; name: string; type: 'Competition' | 'Outreach'; dates: string; destination: string; travel: string; participation: string; readiness: string; fee: number; paid: number; overnight?: boolean; openTasks?: number }
export interface TaskView { id: string; event: string; title: string; due: string; status: string; action: string; href: string }
export interface StudentView { id: string; name: string; subteam: string; travelTeam: boolean; attendance: number; events: number; ready: boolean; email?: string; shirt?: string; legal?: string; room?: string; allergy?: string; medications?: string; contact?: string }

export const students: StudentView[] = [
  { id: 'A', name: 'Student A', subteam: 'Mechanical', travelTeam: true, attendance: 75, events: 3, ready: false, email: 'studenta@district.org', shirt: 'S', legal: 'Student A Example', room: 'Girls', allergy: 'Peanuts', medications: 'None reported', contact: 'Contact A · Relative' },
  { id: 'B', name: 'Student B', subteam: 'Programming', travelTeam: true, attendance: 88, events: 4, ready: true, email: 'studentb@gmail.com', shirt: 'M', legal: 'Student B Example', room: 'Boys', allergy: 'None reported', medications: 'Inhaler as needed', contact: 'Contact B · Relative' },
  { id: 'C', name: 'Student C', subteam: 'Electrical', travelTeam: false, attendance: 50, events: 1, ready: false, email: 'studentc@district.org', legal: 'Student C Example' },
  { id: 'D', name: 'Student D', subteam: 'Outreach', travelTeam: true, attendance: 50, events: 3, ready: false, email: 'studentd@district.org', shirt: 'M', legal: 'Student D Example', room: 'Girls', allergy: 'None reported', medications: 'None reported' },
  { id: 'E', name: 'Student E', subteam: 'Mechanical', travelTeam: true, attendance: 88, events: 4, ready: true, email: 'studente@district.org', shirt: 'XL', legal: 'Student E Example', room: 'Boys', allergy: 'Penicillin', medications: 'None reported' },
  { id: 'F', name: 'Student F', subteam: 'Programming', travelTeam: false, attendance: 25, events: 1, ready: false, email: 'studentf@gmail.com', legal: 'Student F Example' },
  { id: 'H', name: 'Student H', subteam: 'Electrical', travelTeam: true, attendance: 63, events: 4, ready: false, email: 'studenth@district.org', shirt: 'L', legal: 'Student H Example', room: 'Boys', allergy: 'None reported', medications: 'None reported' },
  { id: 'P', name: 'Student P', subteam: 'Outreach', travelTeam: true, attendance: 75, events: 2, ready: true },
  { id: 'Q', name: 'Student Q', subteam: 'Programming', travelTeam: true, attendance: 63, events: 2, ready: false },
  { id: 'R', name: 'Student R', subteam: 'Mechanical', travelTeam: true, attendance: 88, events: 2, ready: true },
]

export const events: EventView[] = [
  { id:'E1', name:'Regional 1', type:'Competition', dates:'Mar 4–7, 2027', destination:'City A', travel:'Vehicles · hotel, 3 nights', participation:'Confirmed', readiness:'3 open', fee:450, paid:120, overnight:true, openTasks:3 },
  { id:'E2', name:'Regional 2', type:'Competition', dates:'Apr 1–4, 2027', destination:'City B', travel:'Charter bus · hotel, 3 nights', participation:'Confirmed', readiness:'2 open', fee:520, paid:0, overnight:true, openTasks:2 },
  { id:'E3', name:'Offseason Event 1', type:'Competition', dates:'Oct 24, 2026', destination:'City C', travel:'School van · day trip', participation:'Pending', readiness:'Pending', fee:40, paid:0, openTasks:0 },
  { id:'E4', name:'Library STEM Night', type:'Outreach', dates:'Nov 2, 2026', destination:'Local', travel:'Families provide transportation', participation:'Open for signup', readiness:'Not applicable', fee:0, paid:0 },
  { id:'E5', name:'Offseason Event 2', type:'Competition', dates:'Nov 14, 2026', destination:'City D', travel:'School van · day trip', participation:'Open for signup', readiness:'Open', fee:35, paid:0 },
  { id:'E7', name:'Elementary Robot Demo', type:'Outreach', dates:'Nov 20, 2026', destination:'Local', travel:'Families provide transportation', participation:'Open for signup', readiness:'Not applicable', fee:0, paid:0 },
]

export const tasks: TaskView[] = [
  { id:'room', event:'Regional 1', title:'Choose roommates', due:'Jan 15, 2027', status:'To do', action:'Choose roommates', href:'/events/E1/rooming' },
  { id:'first', event:'Regional 1', title:'FIRST registration', due:'Jan 15, 2027', status:'To do', action:'View instructions', href:'/events/E1' },
  { id:'payment', event:'Regional 1', title:'Required payment', due:'Feb 15, 2027', status:'To do', action:'See balance', href:'/finances' },
  { id:'permission', event:'Regional 2', title:'Permission accepted', due:'Feb 15, 2027', status:'Pending', action:'See details', href:'/events/E2' },
]

export const roleNames: Record<Role,string> = { student:'Student', parent:'Parent', coach:'Coach', travelLead:'Travel Lead', mentor:'Mentor' }
