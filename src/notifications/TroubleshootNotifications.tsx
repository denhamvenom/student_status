import { CircleHelp } from 'lucide-react'
import { notificationsCopy } from '@/copy/notifications-copy'
import { detectOS, type DeviceOS } from '@/pwa'

const copy = notificationsCopy.troubleshoot
const ALL: readonly Exclude<DeviceOS, 'other'>[] = ['windows', 'mac', 'ios', 'android']

function Section({ os }: { os: Exclude<DeviceOS, 'other'> }) {
  return <div>
    <p className="m-0 font-bold">{copy[os].label}</p>
    <ol className="m-0 mt-1 flex flex-col gap-1 pl-5">{copy[os].steps.map(step => <li key={step}>{step}</li>)}</ol>
  </div>
}

/** "Not seeing notifications?" help, closed by default. Shows this device's steps first; others are one tap away. */
export function TroubleshootNotifications() {
  const os = detectOS()
  const others = os === 'other' ? ALL : ALL.filter(each => each !== os)
  return <details className="rounded-lg border border-[var(--border-default)] p-3">
    <summary className="cursor-pointer py-2.5 font-bold"><CircleHelp size={20} aria-hidden="true" className="mr-1.5 inline align-[-4px]"/>{copy.title}</summary>
    <div className="mt-2 flex flex-col gap-3 text-sm">
      <p className="m-0">{copy.intro}</p>
      {os === 'other'
        ? others.map(each => <Section key={each} os={each}/>)
        : <>
          <Section os={os}/>
          <details>
            <summary className="cursor-pointer py-2.5 font-bold text-[var(--accent-text)]">{copy.otherDevices}</summary>
            <div className="mt-2 flex flex-col gap-3">{others.map(each => <Section key={each} os={each}/>)}</div>
          </details>
        </>}
    </div>
  </details>
}
