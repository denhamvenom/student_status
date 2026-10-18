import { useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { withdrawnFeeLabel } from './lib/withdrawn-fee-label'
export function WithdrawnEventFee({eventId,studentId,feeCents}:{eventId:Id<'events'>;studentId:Id<'students'>;feeCents:number}){
  const preview=useQuery(api.withdrawals.withdrawalPreview,{eventId,studentId})
  return <>{withdrawnFeeLabel(feeCents,preview?.charges)}</>
}
