import { createElement, useState } from 'react'
import { renderToString } from 'react-dom/server'
import { ConvexProvider, type ConvexReactClient } from 'convex/react'
import { describe, expect, it } from 'vitest'
import { useMentorModeLists } from './mentor-mode-lists'

// A client whose queries never load: enough for useQueries to subscribe.
const watch = { onUpdate: () => () => {}, localQueryResult: () => undefined, journal: () => undefined }
const client = { watchQuery: () => watch } as unknown as ConvexReactClient

/** Renders the wizard's hook and then re-renders it a few times, the way typing into the wizard does. */
function Probe({ mentor, withStudents }: { mentor: boolean; withStudents: boolean }) {
  const [renders, setRenders] = useState(0)
  if (renders < 3) setRenders(renders + 1)
  const lists = useMentorModeLists(mentor, withStudents)
  return createElement('output', null, Object.keys(lists).sort().join(','))
}

describe('New event wizard lists (regression: Create a meeting crashed with "Too many re-renders")', () => {
  it.each([
    ['Mentor, no specific students', true, false, 'mentors'],
    ['Mentor, specific students', true, true, 'mentors,students'],
    ['Coach or Travel Lead', false, false, ''],
  ])('%s: re-renders without looping', (_, mentor, withStudents, keys) => {
    const html = renderToString(createElement(ConvexProvider, { client }, createElement(Probe, { mentor, withStudents })))
    expect(html).toBe(`<output>${keys}</output>`)
  })
})
