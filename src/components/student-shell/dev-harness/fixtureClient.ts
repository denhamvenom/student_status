import { getFunctionName, type FunctionReference } from 'convex/server'
import type { ConvexReactClient } from 'convex/react'

export type Responder = (args: Record<string, unknown>) => unknown
export type FixtureTable = Record<string, Responder>
type Reference = FunctionReference<'query' | 'mutation' | 'action'> | string

/**
 * Development harness only: a stand-in for ConvexReactClient that answers queries and mutations from synthetic
 * fixtures and never opens a connection. Queries without a fixture stay loading and are listed in `missing`.
 * After a mutation or action, every query is answered again (fixtures may have changed, e.g. the saved theme).
 */
export function fixtureClient(queries: FixtureTable, mutations: FixtureTable, actions: FixtureTable = {}) {
  const missing = new Set<string>()
  const listeners = new Set<() => void>()
  const cache = new Map<string, unknown>()
  const name = (reference: Reference) => typeof reference === 'string' ? reference : getFunctionName(reference)
  const query = (reference: Reference, args: Record<string, unknown>) => {
    const key = `${name(reference)}:${JSON.stringify(args)}`
    if (!cache.has(key)) {
      const responder = queries[name(reference)]
      if (!responder) missing.add(name(reference))
      cache.set(key, responder?.(args))
    }
    return cache.get(key)
  }
  const run = async (table: FixtureTable, reference: Reference, args: Record<string, unknown>) => {
    const responder = table[name(reference)]
    if (!responder) missing.add(name(reference))
    const result = responder?.(args)
    cache.clear()
    for (const listener of [...listeners]) listener()
    if (result instanceof Error) throw result
    return result ?? null
  }
  const watch = (reference: Reference, args: Record<string, unknown> = {}) => ({
    onUpdate: (callback: () => void) => { listeners.add(callback); return () => { listeners.delete(callback) } },
    localQueryResult: () => query(reference, args),
    journal: () => undefined,
  })
  const client = {
    address: 'https://fixture.example.invalid',
    logger: { log() {}, logVerbose() {}, warn() {}, error() {} },
    options: {},
    setAuth() {},
    clearAuth() {},
    watchQuery: watch,
    watchPaginatedQuery: watch,
    mutation: (reference: Reference, args: Record<string, unknown> = {}) => run(mutations, reference, args),
    action: (reference: Reference, args: Record<string, unknown> = {}) => run(actions, reference, args),
  }
  return { client: client as unknown as ConvexReactClient, missing }
}
