/** Keep focused detail headings below the actual sticky shell, including wrapped navigation. */
export function observeStickyHeader(header: HTMLElement, shell: HTMLElement) {
  const update = () => shell.style.setProperty('--app-header-height', `${Math.ceil(header.getBoundingClientRect().height)}px`)
  update()
  const observer = new ResizeObserver(update)
  observer.observe(header)
  return () => { observer.disconnect(); shell.style.removeProperty('--app-header-height') }
}
