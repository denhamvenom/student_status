import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { downloadCsv } from '@/features/event-setup/signup-csv'
import { rosterManagementCopy as copy } from '@/lib/roster-management-copy'
import { reminderText, rosterExportCsv, type ReminderFormat, type RequirementKey, type RosterExportRow } from './roster-requirements'
import styles from '../../CoachRoster.module.css'

const itemLabels: Record<RequirementKey, string> = {
  attention: copy.itemAttention, first: copy.itemFirst, permission: copy.itemPermission, balance: copy.itemBalance, missing: copy.itemMissing,
}

type Props = {
  selected: RosterExportRow[]
  matching: number
  defaultItem: RequirementKey
  signingOpen: boolean
  onSelectAll: () => void
  onClear: () => void
}

/** Sticky bar for the selected students: Copy reminder (text only, nothing is sent), Export list, Clear. */
export function RosterBulkBar({ selected, matching, defaultItem, signingOpen, onSelectAll, onClear }: Props) {
  const [item, setItem] = useState<RequirementKey | null>(null)
  const [format, setFormat] = useState<ReminderFormat>('group')
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [manualText, setManualText] = useState('')
  const current = item ?? defaultItem
  const items = (Object.keys(itemLabels) as RequirementKey[]).filter(key => key !== 'permission' || signingOpen)
  const reminder = reminderText(selected, current, format)

  const copyReminder = async () => {
    setManualText('')
    if (!reminder.included) { setMessage(copy.nobodyHasItem); return }
    try {
      await navigator.clipboard.writeText(reminder.text)
      setMessage(`${copy.copied(reminder.included)}${reminder.left ? ` ${copy.leftOut(reminder.left)}` : ''}`)
    } catch {
      setMessage(copy.copyFailed)
      setManualText(reminder.text)
    }
  }
  const exportList = () => {
    downloadCsv('team-roster-selected.csv', rosterExportCsv(selected))
    setMessage(copy.exported(selected.length))
  }

  return <section className={styles.bulkBar} role="region" aria-label={copy.selectedBar}>
    <div className={styles.bulkRow}>
      <strong>{copy.selectedCount(selected.length)}</strong>
      {selected.length < matching && <Button type="button" variant="outline" onClick={onSelectAll}>{copy.selectAll(matching)}</Button>}
      <Button type="button" variant="outline" className={styles.bulkOptionsToggle} aria-expanded={optionsOpen} aria-controls="roster-bulk-options" onClick={() => setOptionsOpen(open => !open)}>{copy.reminderOptions}</Button>
      <div id="roster-bulk-options" className={styles.bulkOptions} data-open={optionsOpen}>
      <NativeSelect aria-label={copy.reminderAbout} value={current} onChange={event => setItem(event.target.value as RequirementKey)}>
        {items.map(key => <NativeSelectOption key={key} value={key}>{itemLabels[key]}</NativeSelectOption>)}
      </NativeSelect>
      <NativeSelect aria-label={copy.reminderFormat} value={format} onChange={event => setFormat(event.target.value as ReminderFormat)}>
        <NativeSelectOption value="group">{copy.formatGroup}</NativeSelectOption>
        <NativeSelectOption value="perStudent">{copy.formatPerStudent}</NativeSelectOption>
      </NativeSelect>
      </div>
      <Button type="button" onClick={() => void copyReminder()}>{copy.copyReminder} · {itemLabels[current]}</Button>
      <Button type="button" variant="outline" onClick={exportList}>{copy.exportList}</Button>
      <Button type="button" variant="outline" onClick={() => { setMessage(''); setManualText(''); onClear() }}>{copy.clear}</Button>
    </div>
    {message && <p className={styles.note} role="status">{message}</p>}
    {manualText && <textarea className={styles.manualCopy} readOnly aria-label={copy.copyReminder} value={manualText} rows={4} onFocus={event => event.currentTarget.select()} />}
  </section>
}
