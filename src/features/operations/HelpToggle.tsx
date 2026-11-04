import { useId, useState, type ReactNode } from 'react'
import styles from './Operations.module.css'

/** A 44px "?" button that shows rules or background prose only when asked, keeping status lines short. */
export function HelpToggle({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return <>
    <button type="button" className={styles.helpToggle} aria-label={label} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>?</button>
    {open && <span id={id} className={styles.helpText}>{children}</span>}
  </>
}
