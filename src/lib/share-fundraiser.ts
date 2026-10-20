export async function shareFundraiser(url: string): Promise<'shared' | 'copied' | 'cancelled' | 'manual'> {
  if (typeof navigator.share === 'function' && window.matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ title: 'Student fundraiser', url }); return 'shared' }
    catch (error) { if (error instanceof Error && error.name === 'AbortError') return 'cancelled' }
  }
  try {
    if (!navigator.clipboard?.writeText) return 'manual'
    await navigator.clipboard.writeText(url)
    return 'copied'
  } catch { return 'manual' }
}
