import { useId } from 'react'
import { audienceCopy } from './audience-copy'
import styles from './Audience.module.css'
import { RadioChoice } from './RadioChoice'
import type { Where } from './types'

const places: readonly Where[] = ['shop', 'elsewhere', 'virtual']

/**
 * Where the event happens, asked once: at our shop, somewhere else, or Virtual (Discord). Only "Somewhere else" asks
 * for a destination and travel; the shop and Discord need no transport, rooming or overnight stay.
 */
export function WherePicker({ value, onChange, id: givenId, disabled }: { value: Where; onChange: (value: Where) => void; id?: string; disabled?: boolean }) {
  const copy = audienceCopy.location
  const autoId = useId()
  const id = givenId ?? autoId
  return <fieldset id={id} tabIndex={-1} className={styles.group} disabled={disabled}>
    <legend>{copy.legend}</legend>
    <div className={styles.choices}>
      {places.map(place => <RadioChoice key={place} name={`${id}-where`} value={place} checked={value === place} label={copy[place].label} helper={copy[place].helper} onSelect={() => onChange(place)} />)}
    </div>
  </fieldset>
}
