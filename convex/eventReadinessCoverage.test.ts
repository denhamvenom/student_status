/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'
import { createTest } from '../testUtils'
import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

async function fixture() {
  const t = createTest(schema, modules)
  const ids = await t.run(async ctx => {
    const auth = await ctx.db.insert('users', { email: 'coach@example.org', name: 'Coach' })
    const coach = await ctx.db.insert('appUsers', { authUserId: auth, email: 'coach@example.org', name: 'Coach', role: 'coach', travelLead: false, financialEdit: true, active: true })
    const season = await ctx.db.insert('seasons', { name: 'Synthetic season', year: 2026, status: 'active', startsAt: 0, permissionVersion: 'DRAFT', createdBy: coach })
    const student = await ctx.db.insert('students', { seasonId: season, legalName: 'Synthetic Student', preferredName: 'Student', email: 'student@example.org', subteam: 'Mechanical', active: true, travelTeam: false, roomCategory: 'Boys', roomCategoryLocked: true, allergies: { state: 'none' }, medications: { state: 'none' } })
    const event = await ctx.db.insert('events', { seasonId: season, name: 'Regional', type: 'Competition', startsAt: 1000, endsAt: 2000, destination: 'City', travel: 'Families provide transportation', overnight: true, roomingEnabled: true, feeCents: 0, signupMode: 'open', allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false })
    return { auth, coach, student, event }
  })
  return { t, ids, coach: t.withIdentity({ subject: `${ids.auth}|session` }) }
}

describe('event readiness coverage', () => {
  it('marks participant sentinel overflow incomplete without reporting ready transportation', async () => {
    const f = await fixture()
    await f.t.run(async ctx => { for (let n = 0; n < 501; n++) await ctx.db.insert('participants', { eventId: f.ids.event, studentId: f.ids.student, status: 'withdrawn', createdAt: n, updatedAt: n }) })
    const result = await f.coach.query(api.app.eventReadiness, { eventId: f.ids.event })
    expect(result.coverage?.participantsComplete).toBe(false)
    expect(result.transportation).toBeNull()
    expect(result.overall).toBe('open')
  })

  it('marks room-group sentinel overflow incomplete and does not report ready rooming', async () => {
    const f = await fixture()
    await f.t.run(async ctx => { for (let n = 0; n < 101; n++) await ctx.db.insert('roomGroups', { eventId: f.ids.event, category: 'Boys', name: `Room ${n}`, finalized: true, adultFifthException: false, needsReview: false, createdBy: f.ids.coach }) })
    const result = await f.coach.query(api.app.eventReadiness, { eventId: f.ids.event })
    expect(result.coverage?.roomingComplete).toBe(false)
    expect(result.rooming?.state).toBe('open')
    expect(result.overall).toBe('open')
  })
})
