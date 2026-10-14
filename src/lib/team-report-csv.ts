import { attendanceStatusLabel, eventCoverageLabel, eventReadinessLabel } from './report-state-copy'

export type TeamReportCsvRow = {
  name:string;subteam:string;travelTeam:boolean;
  finance:{chargedCents:number|null;paidCents:number|null;dueCents:number|null;raisedCents:number|null;travelAccountCents:number|null};
  attendance:{offTuesday:number;offThursday:number;offOutreach:number;buildWeekday:number;buildSaturday:number;buildSunday:number;buildOutreach:number}|null;
  eventsCount:number|null;
  selectedEvent:{state:string;outstanding:string[]}|null;
}
export type TeamReportCsvScope = {seasonId:string;asOf:number;selectedEvent:string|null;selectedEventAt:number|null;subteam:string;outstandingOnly:boolean;loadedCount:number;filteredCount:number;hasMore:boolean;attendanceState:string;eventsCoverage:string}
function cell(value:string|number){const text=Array.from(String(value),character=>character.charCodeAt(0)<32?' ':character).join('');const safe=/^[\s\uFEFF]*[=+\-@]/u.test(text)?`'${text}`:text;return `"${safe.replaceAll('"','""')}"`}
const amount=(value:number|null)=>value===null?'Unavailable':value
export function teamReportStatus(rows:TeamReportCsvRow[],scope:TeamReportCsvScope):'Draft'|'Complete'{
  if(scope.hasMore||scope.attendanceState!=='ready'||scope.eventsCoverage!=='complete'||scope.selectedEvent===null)return 'Draft'
  if(rows.some(row=>!row.attendance||row.eventsCount===null||Object.values(row.finance).some(value=>value===null)||row.selectedEvent?.state==='open'||row.selectedEvent?.state==='unknown'))return 'Draft'
  return 'Complete'
}
export function teamReportCsv(rows:TeamReportCsvRow[],scope:TeamReportCsvScope){
  const lines=[
    ['Report status',teamReportStatus(rows,scope)],['Scope','Students currently shown after filters'],['Season ID',scope.seasonId],['As of',new Date(scope.asOf).toISOString()],['Selected event',scope.selectedEvent??'None'],['Event starts at',scope.selectedEventAt===null?'None':new Date(scope.selectedEventAt).toISOString()],['Subteam filter',scope.subteam||'All'],['Outstanding only',scope.outstandingOnly?'Yes':'No'],['Students shown before filters',scope.loadedCount],['Students included',scope.filteredCount],['More students available',scope.hasMore?'Yes':'No'],['Attendance coverage',attendanceStatusLabel(scope.attendanceState)],['Event coverage',eventCoverageLabel(scope.eventsCoverage)],[],
    ['Student','Subteam','Travel Team','Charged cents','Paid cents','Balance due cents','Raised cents','Available funds cents','Offseason Tuesday','Offseason Thursday','Offseason Outreach','Build weekday','Build Saturday','Build Sunday','Build Outreach','Events','Selected event readiness','Outstanding requirements'],
    ...rows.map(row=>[row.name,row.subteam,row.travelTeam?'Yes':'No',amount(row.finance.chargedCents),amount(row.finance.paidCents),amount(row.finance.dueCents),row.finance.raisedCents===null?'Unknown':row.finance.raisedCents,amount(row.finance.travelAccountCents),row.attendance?.offTuesday??'Unavailable',row.attendance?.offThursday??'Unavailable',row.attendance?.offOutreach??'Unavailable',row.attendance?.buildWeekday??'Unavailable',row.attendance?.buildSaturday??'Unavailable',row.attendance?.buildSunday??'Unavailable',row.attendance?.buildOutreach??'Unavailable',row.eventsCount??'Unknown',eventReadinessLabel(row.selectedEvent?.state??null),row.selectedEvent?.outstanding.join('; ')??'Unavailable']),
  ];
  return '\uFEFF'+lines.map(line=>line.map(cell).join(',')).join('\r\n')+'\r\n';
}
