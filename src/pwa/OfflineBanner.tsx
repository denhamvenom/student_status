import { WifiOff } from 'lucide-react'
import { useOnlineStatus } from './useOnlineStatus'

/** Small pill under the status bar while the browser is offline. The live region always exists so screen readers announce changes. */
export function OfflineBanner() {
  const online = useOnlineStatus()
  return <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+8px)] z-[60] flex justify-center px-3">
    {!online && <p className="m-0 inline-flex items-center gap-2 rounded-full border border-[#e6bc0f] bg-[#fdd023] px-3 py-1.5 text-[13px] font-bold leading-tight text-[#222] shadow-md"><WifiOff size={16} aria-hidden="true"/>You're offline — showing saved data</p>}
  </div>
}
