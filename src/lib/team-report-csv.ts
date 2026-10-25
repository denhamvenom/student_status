import { attendanceStatusLabel, eventCoverageLabel, eventReadinessLabel } from './report-state-copy'
import { subteamDisplay } from './subteams'

export type TeamReportCsvRow = {
  name:string;subteam:string;travelTeam:boolean;fundraiserConnected:boolean;
  finance:{chargedCents:number|null;paidCents:number|null;dueCents:number|null;raisedCents:number|null;travelAccountCents:number|null};
  attendance:{offTuesday:number;offThursday:number;offOutreach:number;buildWeekday:number;buildSaturday:number;buildSunday:number;buildOutreach:number}|null;
  eventsCount:number|null;
  selectedEvent:{state:string;outstanding:string[]}|null;
}
export type TeamReportCsvScope = {seasonId:string;asOf:number;selectedEvent:string|null;selectedEventAt:number|null;subteam:string;outstandingOnly:boolean;loadedCount:number;filteredCount:number;hasMore:boolean;attendanceState:string;eventsCoverage:string}
function cell(value:string|number){const text=Array.from(String(value),character=>character.charCodeAt(0)<32?' ':character).join('');const safe=/^[\s\uFEFF]*[=+\-@]/u.test(text)?`'${text}`:text;return `"${safe.replaceAll('"','""')}"`}
// Money columns are labeled in dollars for people; nothing parses this export back.
const dollars=(cents:number)=>(cents/100).toFixed(2)
const amount=(value:number|null)=>value===null?'Unavailable':dollars(value)
const attendanceAmount=(value:number|undefined,state:string)=>value??(state==='unknownKickoff'?'Not counted yet':'Unavailable')
export function teamReportStatus(rows:TeamReportCsvRow[],scope:TeamReportCsvScope):'Draft'|'Complete'{
  if(scope.hasMore||scope.attendanceState!=='ready'||scope.eventsCoverage!=='complete'||scope.selectedEvent===null)return 'Draft'
  if(rows.some(row=>!row.attendance||row.eventsCount===null||Object.values(row.finance).some(value=>value===null)||row.selectedEvent?.state==='open'||row.selectedEvent?.state==='unknown'))return 'Draft'
  return 'Complete'
}
export function teamReportCsv(rows:TeamReportCsvRow[],scope:TeamReportCsvScope){
  const lines=[
    ['Report status',teamReportStatus(rows,scope)],['Scope','Students currently shown after filters'],['Season reference (for support)',scope.seasonId],['As of',new Date(scope.asOf).toISOString()],['Selected event',scope.selectedEvent??'None'],['Event starts at',scope.selectedEventAt===null?'None':new Date(scope.selectedEventAt).toISOString()],['Subteam filter',scope.subteam||'All'],['Only students with requirements left',scope.outstandingOnly?'Yes':'No'],['Students shown before filters',scope.loadedCount],['Students included',scope.filteredCount],['More students available',scope.hasMore?'Yes':'No'],['Attendance coverage',attendanceStatusLabel(scope.attendanceState)],['Event coverage',eventCoverageLabel(scope.eventsCoverage)],[],
    ['Student','Subteam','Travel Team','Fundraiser Link','Fees ($)','Paid ($)','Balance due ($)','Raised ($)','Available funds ($)','Offseason Tuesday','Offseason Thursday','Offseason Outreach','Build weekday','Build Saturday','Build Sunday','Build Outreach','Events','Event readiness','Requirements left'],
    ...rows.map(row=>[row.name,subteamDisplay(row.subteam),row.travelTeam?'Yes':'No',row.fundraiserConnected?'Connected':'Disconnected',amount(row.finance.chargedCents),amount(row.finance.paidCents),amount(row.finance.dueCents),row.finance.raisedCents===null?'Unknown':dollars(row.finance.raisedCents),amount(row.finance.travelAccountCents),attendanceAmount(row.attendance?.offTuesday,scope.attendanceState),attendanceAmount(row.attendance?.offThursday,scope.attendanceState),attendanceAmount(row.attendance?.offOutreach,scope.attendanceState),attendanceAmount(row.attendance?.buildWeekday,scope.attendanceState),attendanceAmount(row.attendance?.buildSaturday,scope.attendanceState),attendanceAmount(row.attendance?.buildSunday,scope.attendanceState),attendanceAmount(row.attendance?.buildOutreach,scope.attendanceState),row.eventsCount??'Unknown',eventReadinessLabel(row.selectedEvent?.state??null),row.selectedEvent?.outstanding.join('; ')??'Unavailable']),
  ];
  return '\uFEFF'+lines.map(line=>line.map(cell).join(',')).join('\r\n')+'\r\n';
}
