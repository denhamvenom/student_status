import { afterEach, expect, it, vi } from 'vitest'
import { observeStickyHeader } from './sticky-header'
afterEach(()=>vi.unstubAllGlobals())
it('tracks actual header resizing and removes stale offsets on unmount',()=>{
  let height=162.2
  let resize=()=>{}
  const disconnect=vi.fn(), observe=vi.fn(), setProperty=vi.fn(), removeProperty=vi.fn()
  vi.stubGlobal('ResizeObserver',class { constructor(callback:()=>void){resize=callback} observe=observe; disconnect=disconnect })
  const header={getBoundingClientRect:()=>({height})} as HTMLElement
  const shell={style:{setProperty,removeProperty}} as unknown as HTMLElement
  const cleanup=observeStickyHeader(header,shell)
  expect(observe).toHaveBeenCalledWith(header)
  expect(setProperty).toHaveBeenLastCalledWith('--app-header-height','163px')
  height=72;resize();expect(setProperty).toHaveBeenLastCalledWith('--app-header-height','72px')
  height=218;resize();expect(setProperty).toHaveBeenLastCalledWith('--app-header-height','218px')
  cleanup();expect(disconnect).toHaveBeenCalledOnce();expect(removeProperty).toHaveBeenCalledWith('--app-header-height')
})
