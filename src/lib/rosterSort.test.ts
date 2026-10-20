import { describe, expect, it } from 'vitest'
import { gradeLabel, sortRoster } from './rosterSort'

const row=(studentId:string,name:string,lastName:string,grade:string|null,subteam='Build')=>({studentId,name,lastName,grade,subteam})
describe('whole-roster sorting',()=>{
  it('brings a second-directory-page surname into the first visible page',()=>{
    const first=Array.from({length:100},(_,index)=>row(`first-${index}`,`Student ${index} Zulu`,'Zulu','Senior'))
    const second=row('second','Zoe Alpha','Alpha','Freshman')
    expect(sortRoster([...first,second],'lastName','asc')[0].studentId).toBe('second')
    expect(sortRoster([...first,second],'lastName','desc').at(-1)?.studentId).toBe('second')
  })
  it('keeps unfamiliar and missing grades after 9 through 12 in either direction',()=>{
    const rows=[row('missing','Missing Grade','Grade',null),row('unknown','Transfer Year','Year','Transfer year'),row('senior','Senior Known','Known','12th'),row('freshman','Freshman Known','Known','9')]
    expect(sortRoster(rows,'grade','asc').map(item=>item.studentId)).toEqual(['freshman','senior','missing','unknown'])
    expect(sortRoster(rows,'grade','desc').slice(0,2).map(item=>item.studentId)).toEqual(['senior','freshman'])
    expect(sortRoster(rows,'grade','desc').slice(2).map(item=>item.studentId).sort()).toEqual(['missing','unknown'])
    expect(gradeLabel(null)).toBe('Not provided')
    expect(gradeLabel('10th')).toBe('Sophomore')
    expect(gradeLabel('Transfer year')).toBe('Transfer year')
  })
  it('sorts saved subteam aliases together and missing subteams last',()=>{
    const rows=[row('none','No Team','Team',null,''),row('legacy','Legacy','Legacy',null,'Mechanical'),row('build','Build','Build',null,'Build'),row('other','Other','Other',null,'Programming')]
    expect(sortRoster(rows,'subteam','asc').map(item=>item.studentId)).toEqual(['build','legacy','other','none'])
  })
})
