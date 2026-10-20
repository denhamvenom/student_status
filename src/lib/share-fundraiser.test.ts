import { afterEach, describe, expect, it, vi } from 'vitest'
import { shareFundraiser } from './share-fundraiser'
const url = 'https://www.zeffy.com/en-US/test-fundraiser'
afterEach(() => vi.unstubAllGlobals())
function setup(mobile: boolean) {
  const share = vi.fn().mockResolvedValue(undefined), writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { share, clipboard: { writeText } })
  vi.stubGlobal('window', { matchMedia: () => ({ matches: mobile }) })
  return { share, writeText }
}
describe('fundraiser share action', () => {
  it('copies on desktop even if native sharing is available', async () => {
    const f=setup(false); expect(await shareFundraiser(url)).toBe('copied'); expect(f.writeText).toHaveBeenCalledWith(url); expect(f.share).not.toHaveBeenCalled()
  })
  it('uses native sharing on phones and does not copy after cancellation', async () => {
    const f=setup(true); expect(await shareFundraiser(url)).toBe('shared'); expect(f.share).toHaveBeenCalledWith({title:'Student fundraiser',url});
    f.share.mockRejectedValue(Object.assign(new Error('Cancelled'),{name:'AbortError'})); expect(await shareFundraiser(url)).toBe('cancelled'); expect(f.writeText).not.toHaveBeenCalled()
  })
  it('falls back to clipboard and offers manual copying when unavailable', async () => {
    const f=setup(true); f.share.mockRejectedValue(new Error('Unavailable')); expect(await shareFundraiser(url)).toBe('copied'); f.writeText.mockRejectedValue(new Error('Denied')); expect(await shareFundraiser(url)).toBe('manual')
  })
})
