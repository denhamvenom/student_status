import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import { internalMutation, internalQuery } from './_generated/server'
import { activeSeason, audit } from './lib/access'
import { canonicalSubteam } from '../src/lib/subteams'

const legacy = new Set(['Mechanical', 'Business', 'Outreach', 'Business and Media'])
const plannedRow = v.object({ studentId: v.id('students'), expectedSubteam: v.string(), expectedRevision: v.number(), newSubteam: v.string() })

/** Bounded, internal-only preview. A page may contain fewer matches than rows scanned. */
export const preview = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({ seasonId: v.id('seasons'), rows: v.array(plannedRow), scanned: v.number(), continueCursor: v.string(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    if (!Number.isSafeInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 20) throw new Error('Preview up to 20 students at a time.')
    const season = await activeSeason(ctx)
    const page = await ctx.db.query('students').withIndex('by_seasonId', q => q.eq('seasonId', season._id)).paginate(args.paginationOpts)
    return {
      seasonId: season._id,
      rows: page.page.filter(student => legacy.has(student.subteam)).map(student => ({ studentId: student._id, expectedSubteam: student.subteam, expectedRevision: student.profileRevision ?? 0, newSubteam: canonicalSubteam(student.subteam) })),
      scanned: page.page.length,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    }
  },
})

/** Prepared for a separately authorized migration; never called by the app. */
export const apply = internalMutation({
  args: { seasonId: v.id('seasons'), actorId: v.id('appUsers'), reason: v.string(), rows: v.array(plannedRow) },
  returns: v.object({ updated: v.number() }),
  handler: async (ctx, args) => {
    const season = await activeSeason(ctx)
    if (season._id !== args.seasonId) throw new Error('Active season changed. Preview again.')
    const actor = await ctx.db.get(args.actorId)
    if (!actor || !actor.active || actor.role !== 'coach') throw new Error('A current Coach is required.')
    if (args.reason.trim().length < 8 || args.reason.length > 1000) throw new Error('Give a reason for this change.')
    if (args.rows.length < 1 || args.rows.length > 20 || new Set(args.rows.map(row => row.studentId)).size !== args.rows.length) throw new Error('Apply 1 to 20 distinct reviewed students.')
    const checked = []
    for (const row of args.rows) {
      const student = await ctx.db.get(row.studentId)
      if (!student || student.seasonId !== season._id || student.subteam !== row.expectedSubteam || (student.profileRevision ?? 0) !== row.expectedRevision || !legacy.has(row.expectedSubteam) || canonicalSubteam(row.expectedSubteam) !== row.newSubteam) throw new Error('A subteam changed. Preview again before applying.')
      checked.push({ student, row })
    }
    for (const { student, row } of checked) {
      await ctx.db.patch(student._id, { subteam: row.newSubteam, profileRevision: row.expectedRevision + 1 })
      await audit(ctx, actor, 'students', student._id, 'standardizeSubteam', { subteam: student.subteam, profileRevision: row.expectedRevision }, { subteam: row.newSubteam, profileRevision: row.expectedRevision + 1 }, args.reason.trim())
    }
    return { updated: checked.length }
  },
})
