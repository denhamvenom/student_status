/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'
import { makeFunctionReference, type FunctionReference } from 'convex/server'
import type { Id } from './_generated/dataModel'
import { createTest as convexTest } from '../testUtils'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
type Planned = { studentId: Id<'students'>; expectedSubteam: string; expectedRevision: number; newSubteam: string }
const preview = makeFunctionReference<'query', { paginationOpts: { cursor: string | null; numItems: number } }, { seasonId: Id<'seasons'>; rows: Planned[]; scanned: number; continueCursor: string; isDone: boolean }>('subteamMigration:preview') as unknown as FunctionReference<'query', 'internal', { paginationOpts: { cursor: string | null; numItems: number } }, { seasonId: Id<'seasons'>; rows: Planned[]; scanned: number; continueCursor: string; isDone: boolean }>
const apply = makeFunctionReference<'mutation', { seasonId: Id<'seasons'>; actorId: Id<'appUsers'>; reason: string; rows: Planned[] }, { updated: number }>('subteamMigration:apply') as unknown as FunctionReference<'mutation', 'internal', { seasonId: Id<'seasons'>; actorId: Id<'appUsers'>; reason: string; rows: Planned[] }, { updated: number }>

describe('prepared subteam migration', () => {
  it('previews a bounded page, refuses stale evidence, and changes only reviewed fields', async () => {
    const t = convexTest(schema, modules)
    const ids = await t.run(async ctx => {
      const authUserId = await ctx.db.insert('users', { email: 'synthetic.coach@example.invalid' })
      const actorId = await ctx.db.insert('appUsers', { authUserId, email: 'synthetic.coach@example.invalid', name: 'Synthetic Coach', role: 'coach', travelLead: false, financialEdit: false, active: true })
      const seasonId = await ctx.db.insert('seasons', { name: 'Synthetic season', year: 2027, status: 'active', startsAt: 0, permissionVersion: 'draft', createdBy: actorId })
      const studentId = await ctx.db.insert('students', { seasonId, legalName: 'Synthetic Student', preferredName: 'Synthetic', email: 'synthetic.student@example.invalid', subteam: 'Mechanical', active: true, travelTeam: true, roomCategoryLocked: false, allergies: { state: 'unknown' }, medications: { state: 'unknown' } })
      return { actorId, seasonId, studentId }
    })
    const plan = await t.query(preview, { paginationOpts: { cursor: null, numItems: 20 } })
    expect(plan).toMatchObject({ seasonId: ids.seasonId, scanned: 1, isDone: true, rows: [{ studentId: ids.studentId, expectedSubteam: 'Mechanical', expectedRevision: 0, newSubteam: 'Build' }] })
    await t.run(ctx => ctx.db.patch(ids.studentId, { profileRevision: 1 }))
    await expect(t.mutation(apply, { seasonId: ids.seasonId, actorId: ids.actorId, reason: 'Approved synthetic subteam test', rows: plan.rows })).rejects.toThrow('Preview again')
    const unchanged = await t.run(ctx => ctx.db.get(ids.studentId))
    expect(unchanged).toMatchObject({ subteam: 'Mechanical', travelTeam: true, profileRevision: 1 })
    const fresh = await t.query(preview, { paginationOpts: { cursor: null, numItems: 20 } })
    expect(await t.mutation(apply, { seasonId: ids.seasonId, actorId: ids.actorId, reason: 'Approved synthetic subteam test', rows: fresh.rows })).toEqual({ updated: 1 })
    const changed = await t.run(ctx => ctx.db.get(ids.studentId))
    expect(changed).toMatchObject({ subteam: 'Build', travelTeam: true, profileRevision: 2 })
  })
})
