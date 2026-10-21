/** Keep time-based roster queries stable until an event can leave the upcoming window. */
export function rosterAsOfAtTransition(asOf: number, transitionAt: number | null | undefined, now: number, visible: boolean): number {
  return visible && transitionAt !== null && transitionAt !== undefined && now >= transitionAt ? now : asOf
}
