import { describe, expect, it, vi } from 'vitest'
import type { FunctionArgs, FunctionReturnType } from 'convex/server'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { collectPermissionExport, emptyChoices, receiptHistoryLabels, eventDateRange } from './PermissionWorkflow'
type Page=FunctionReturnType<typeof api.permissions.exportPacket>
const eventId='synthetic-event' as Id<'events'>
function page(index:number,isDone=false):Page{return{event:{eventId,name:'Synthetic event'},schemaVersion:1,synthetic:false,generatedAt:1000+index,records:Array.from({length:10},(_,offset)=>({studentId:`synthetic-student-${index*10+offset}` as Id<'students'>,studentName:`Synthetic student ${index*10+offset}`,state:'required',revision:0,submissionId:null,signerName:null,signedAt:null,source:null,synthetic:null,collectedAt:1000+index})),isDone,continueCursor:`synthetic-cursor-${index+1}`}}
describe('permission export collection',()=>{
  it('shows one Chicago date for a same-day event and a range across days',()=>{
    const start=Date.parse('2027-05-10T10:00:00-05:00')
    const sameDayEnd=Date.parse('2027-05-10T18:00:00-05:00')
    const nextDayEnd=Date.parse('2027-05-11T10:00:00-05:00')
    expect(eventDateRange(start,sameDayEnd)).toBe('May 10, 2027')
    expect(eventDateRange(start,nextDayEnd)).toBe('May 10, 2027 – May 11, 2027')
  })
  it('labels earlier signed forms without claiming they lost current coverage',()=>{
    expect(receiptHistoryLabels({controlledCoverage:[{eventId,revision:2}]},1)).toEqual(['Earlier signed form'])
    expect(receiptHistoryLabels({controlledCoverage:[]},1)).toEqual(['Earlier signed form','This form does not cover any event now.'])
  })
  it('starts every medication category without a preselected answer',()=>{expect(emptyChoices()).toEqual({pain:'',allergy:'',cold:''})})
  it('collects 500 students across 50 bounded pages before producing one collection-range file',async()=>{
    let index=0
    const fetch=vi.fn(async(args:FunctionArgs<typeof api.permissions.exportPacket>)=>{const current=index++;expect(args).toMatchObject({eventId,includeHealth:false,paginationOpts:{numItems:10,cursor:current?`synthetic-cursor-${current}`:null}});return page(current,current===49)})
    const download=vi.fn()
    const packet=await collectPermissionExport(fetch,{eventId,includeHealth:false}).then(value=>{download(value);return value})
    expect(fetch).toHaveBeenCalledTimes(50);expect(download).toHaveBeenCalledTimes(1);expect(packet.records).toHaveLength(500);expect(packet.synthetic).toBe(false);expect(packet.collectionStartedAt).toBe(1000);expect(packet.collectionCompletedAt).toBe(1049);expect(packet.records[499].collectedAt).toBe(1049);expect(packet.collectionSemantics).toBe('If records change while you download, run the export again for the latest version.')
  })
  it('does not produce a partial download when any page or the final page is denied',async()=>{
    for(const deniedPage of [1,49]){
      let index=0;const download=vi.fn();const fetch=async()=>{if(index===deniedPage)throw new Error('Synthetic revoked export grant');return page(index++,index===50)}
      await expect(collectPermissionExport(fetch,{eventId,includeHealth:true}).then(download)).rejects.toThrow('revoked export grant');expect(download).not.toHaveBeenCalled()
    }
  })
  it('rejects a cursor that cannot advance and unexpected event scope',async()=>{
    let index=0
    await expect(collectPermissionExport(async()=>({...page(index++),continueCursor:'same-cursor'}),{eventId,includeHealth:false})).rejects.toThrow('could not advance')
    await expect(collectPermissionExport(async()=>({...page(0,true),event:{eventId:'different-event' as Id<'events'>,name:'Different synthetic event'}}),{eventId,includeHealth:false})).rejects.toThrow('scope or records changed')
  })
  it('cancels between pages without producing a downloadable packet',async()=>{
    let cancelled=false;const fetch=vi.fn(async()=>page(0));const download=vi.fn()
    await expect(collectPermissionExport(fetch,{eventId,includeHealth:true},{cancelled:()=>cancelled,progress:()=>{cancelled=true}}).then(download)).rejects.toThrow('cancelled');expect(fetch).toHaveBeenCalledTimes(1);expect(download).not.toHaveBeenCalled()
  })
})
