/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import { createTest as convexTest } from '../testUtils'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

describe('Coach subteam changes', () => {
  it('accepts approved choices, rejects retired choices, and guards stale updates', async () => {
    const t = convexTest(schema, modules)
    const ids = await t.run(async ctx => {
      const authUserId = await ctx.db.insert('users', { email: 'synthetic.coach@example.invalid' })
      const actorId = await ctx.db.insert('appUsers', { authUserId, email: 'synthetic.coach@example.invalid', name: 'Synthetic Coach', role: 'coach', travelLead: false, financialEdit: false, active: true })
      const seasonId = await ctx.db.insert('seasons', { name: 'Synthetic season', year: 2027, status: 'active', startsAt: 0, permissionVersion: 'draft', createdBy: actorId })
      const studentId = await ctx.db.insert('students', { seasonId, legalName: 'Synthetic Student', preferredName: 'Synthetic', email: 'synthetic.student@example.invalid', subteam: 'Mechanical', active: true, travelTeam: true, roomCategoryLocked: false, allergies: { state: 'unknown' }, medications: { state: 'unknown' } })
      return { authUserId, studentId }
    })
    const coach = t.withIdentity({ subject: `${ids.authUserId}|session` })
    await expect(coach.mutation(api.admin.updateRoster, { studentId: ids.studentId, expectedRevision: 0, subteam: 'Outreach' })).rejects.toThrow('listed subteam')
    await expect(coach.mutation(api.admin.updateRoster, { studentId: ids.studentId, expectedRevision: 0, subteam: '' })).rejects.toThrow('listed subteam')
    expect((await t.run(ctx => ctx.db.get(ids.studentId)))?.subteam).toBe('Mechanical')
    await coach.mutation(api.admin.updateRoster, { studentId: ids.studentId, expectedRevision: 0, subteam: 'Business/Media' })
    await expect(coach.mutation(api.admin.updateRoster, { studentId: ids.studentId, expectedRevision: 0, subteam: 'Build' })).rejects.toThrow('Profile changed')
    expect(await t.run(ctx => ctx.db.get(ids.studentId))).toMatchObject({ subteam: 'Business/Media', travelTeam: true, profileRevision: 1 })
  })
})
