import { useState } from 'react'
import { Button } from '../../components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/ui/dropdown-menu'
import { AdoptGoogleSeries, adoptSeriesCopy } from './AdoptGoogleSeries'

export const eventsMoreCopy = { trigger: '⋯ More', label: 'More event actions' } as const

/** Coach only: less common Events actions, so the page leads with + New event and + Team meeting. */
export function EventsMoreMenu() {
  const [importOpen, setImportOpen] = useState(false)
  return <>
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" variant="outline" aria-label={eventsMoreCopy.label} />}>{eventsMoreCopy.trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-56">
        <DropdownMenuItem onClick={() => setImportOpen(true)}>{adoptSeriesCopy.open}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <AdoptGoogleSeries open={importOpen} onOpenChange={setImportOpen} />
  </>
}
