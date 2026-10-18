import { Link } from 'react-router'
import styles from './PublicFooter.module.css'

export function PublicFooter() {
  return <footer className={styles.footer}>
    <span>DS Robotics Foundation · Denham Venom Team 8044</span>
    <nav aria-label="Public information">
      <Link to="/about">About</Link>
      <Link to="/privacy">Privacy</Link>
      <Link to="/terms">Terms</Link>
    </nav>
  </footer>
}
