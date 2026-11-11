import { DashboardTile } from '@/components/dashboard/DashboardTile'
import { dashboardButtonVariants } from '@/components/dashboard/styles'
import { setupNextText, type SetupNext } from './logic'

/**
 * Top of Parent Home while setup is unfinished. The button opens the full setup wizard right on Home (one wizard, the
 * same steps as /setup) with Step N of M, Back, Finish later and Review.
 */
export function FinishSetupCard({ studentName, next, onOpen }: { studentName: string; next: SetupNext; onOpen: () => void }) {
  return <DashboardTile tone="urgent" aria-label="Finish setup" className="gap-2">
    <p className="m-0 text-[11px] font-bold tracking-wider text-vs-muted uppercase">Finish setup</p>
    <p className="m-0 text-[15px] text-vs-text">{studentName}&apos;s setup is not finished. It takes a few short steps, and your answers save as you go.</p>
    {setupNextText(next) && <p className="m-0 text-[13px] text-vs-text-2">{setupNextText(next)}</p>}
    <div><button type="button" className={dashboardButtonVariants({ tone: 'primary' })} onClick={onOpen}>Finish setup</button></div>
  </DashboardTile>
}
