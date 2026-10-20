import { canonicalGrade, displayedGrade } from './grades'
import { canonicalSubteam } from './subteams'

export type RosterSort = 'lastName' | 'grade' | 'subteam'
export type Direction = 'asc' | 'desc'
export type DirectoryRow = {studentId:string;name:string;lastName:string;subteam:string;grade:string|null}

const gradeRank = {Freshman:0,Sophomore:1,Junior:2,Senior:3} as const
const compareText = (a:string,b:string) => a.localeCompare(b,undefined,{sensitivity:'base',numeric:true})

export function gradeLabel(value:string|null|undefined){return value?.trim() ? displayedGrade(value) : 'Not provided'}

export function sortRoster<T extends DirectoryRow>(rows:readonly T[],sort:RosterSort,direction:Direction):T[]{
  const scalar=(a:string,b:string)=>compareText(a,b)*(direction==='asc'?1:-1)
  return [...rows].sort((a,b)=>{
    if(sort==='grade'){
      const ga=canonicalGrade(a.grade),gb=canonicalGrade(b.grade)
      const ra=ga===null?4:gradeRank[ga],rb=gb===null?4:gradeRank[gb]
      if(ra!==rb) return ra===4?1:rb===4?-1:(ra-rb)*(direction==='asc'?1:-1)
      if(ra===4){const unknown=scalar(a.grade?.trim()||'',b.grade?.trim()||'');if(unknown)return unknown}
    }
    if(sort==='subteam'){
      const sa=canonicalSubteam(a.subteam)||a.subteam.trim(),sb=canonicalSubteam(b.subteam)||b.subteam.trim()
      if(Boolean(sa)!==Boolean(sb))return sa? -1:1
      const result=scalar(sa,sb);if(result)return result
    }
    if(sort==='lastName'){const result=scalar(a.lastName,b.lastName);if(result)return result}
    return compareText(a.name,b.name)||compareText(a.studentId,b.studentId)
  })
}
