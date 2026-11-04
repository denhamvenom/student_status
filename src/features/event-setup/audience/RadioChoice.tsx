import type { ReactNode } from 'react'
import styles from './Audience.module.css'

/** A large native radio card: whole card is the label, helper text is read with the option. */
export function RadioChoice({ name, value, checked, disabled, label, helper, describedBy, onSelect }: { name: string; value: string; checked: boolean; disabled?: boolean; label: ReactNode; helper?: ReactNode; describedBy?: string; onSelect: () => void }) {
  return <label className={styles.choice}>
    <input type="radio" name={name} value={value} checked={checked} disabled={disabled} aria-describedby={describedBy} onChange={() => onSelect()} />
    <span className={styles.choiceText}><strong>{label}</strong>{helper && <span>{helper}</span>}</span>
  </label>
}
