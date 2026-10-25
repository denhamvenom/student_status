import { describe, expect, it } from 'vitest'
import { teamReportCsv, teamReportStatus } from './team-report-csv'

describe('loaded team report CSV',()=>{
  it('states partial scope, keeps unknown distinct from zero, and escapes spreadsheet formulas',()=>{
    const csv=teamReportCsv([{name:'=HYPERLINK("bad")',subteam:'Mechanical',travelTeam:true,fundraiserConnected:true,finance:{chargedCents:0,paidCents:null,dueCents:null,raisedCents:null,travelAccountCents:0},attendance:null,eventsCount:null,selectedEvent:{state:'unknown',outstanding:['+private requirement']}}],{seasonId:'synthetic',asOf:0,selectedEvent:'Synthetic event',selectedEventAt:3600000,subteam:'',outstandingOnly:false,loadedCount:1,filteredCount:1,hasMore:true,attendanceState:'updating',eventsCoverage:'unknown'})
    expect(csv).toContain('"Students currently shown after filters"')
    expect(csv).toContain('"Fundraiser Link"')
    expect(csv).toContain('"Connected"')
    expect(csv).toContain('"Report status","Draft"')
    expect(csv).toContain('"Event starts at","1970-01-01T01:00:00.000Z"')
    expect(csv).toContain('"More students available","Yes"')
    expect(csv).toContain('"Attendance coverage","Updating; verified totals unavailable"')
    expect(csv).toContain('"Event coverage","Limited to first 50 events; counts may be incomplete"')
    expect(csv).toContain('"\'=HYPERLINK(""bad"")"')
    expect(csv).toContain('"0.00","Unavailable","Unavailable","Unknown","0.00"')
    expect(csv).toContain('"Readiness unavailable","\'+private requirement"')
    expect(csv).toContain('"Build"')
    expect(csv).not.toContain('"Mechanical"')
    expect(csv).not.toContain('PRIVATE HEALTH')
  })
  it('marks an open selected-event requirement Draft even when the loaded scope is complete',()=>{
    const row={name:'Synthetic',subteam:'Mechanical',travelTeam:true,fundraiserConnected:true,finance:{chargedCents:0,paidCents:0,dueCents:0,raisedCents:0,travelAccountCents:0},attendance:{offTuesday:0,offThursday:0,offOutreach:0,buildWeekday:0,buildSaturday:0,buildSunday:0,buildOutreach:0},eventsCount:1,selectedEvent:{state:'open',outstanding:['FIRST registration']}}
    const scope={seasonId:'synthetic',asOf:0,selectedEvent:'Synthetic event',selectedEventAt:3600000,subteam:'',outstandingOnly:false,loadedCount:1,filteredCount:1,hasMore:false,attendanceState:'ready',eventsCoverage:'complete'}
    expect(teamReportStatus([row],scope)).toBe('Draft')
    expect(teamReportStatus([{...row,selectedEvent:{state:'ready',outstanding:[]}}],scope)).toBe('Complete')
    expect(teamReportStatus([{...row,selectedEvent:null}],{...scope,selectedEvent:null,selectedEventAt:null})).toBe('Draft')
  })
  it('keeps not-counted attendance distinct from a counted zero in exports', () => {
    const row = { name: 'Synthetic', subteam: 'Outreach', travelTeam: false, fundraiserConnected: false, finance: { chargedCents: 0, paidCents: 0, dueCents: 0, raisedCents: 0, travelAccountCents: 0 }, attendance: null, eventsCount: 0, selectedEvent: null }
    const scope = { seasonId: 'synthetic', asOf: 0, selectedEvent: null, selectedEventAt: null, subteam: '', outstandingOnly: false, loadedCount: 1, filteredCount: 1, hasMore: false, attendanceState: 'unknownKickoff', eventsCoverage: 'complete' }
    const before = teamReportCsv([row], scope)
    expect(before).toContain('"Business/Media"')
    expect(before).toContain('"Disconnected"')
    expect(before).toContain('"Not counted yet"')
    const after = teamReportCsv([{ ...row, attendance: { offTuesday: 0, offThursday: 0, offOutreach: 0, buildWeekday: 0, buildSaturday: 0, buildSunday: 0, buildOutreach: 0 } }], { ...scope, attendanceState: 'ready' })
    expect(after).not.toContain('"Not counted yet"')
    expect(after).toContain('"0","0","0"')
  })
})
