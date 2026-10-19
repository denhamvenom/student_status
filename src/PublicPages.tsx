import { Link } from 'react-router'
import styles from './PublicPages.module.css'
import { PublicFooter } from './PublicFooter'

function PublicLayout({ children }: { children: React.ReactNode }) {
  return <div className={styles.page}>
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link to="/" className={styles.brand} aria-label="Denham Venom home">
          <img src="/assets/logos/logo-mark-white-text.png" alt="Denham Venom" />
          <span>STUDENT STATUS</span>
        </Link>
        <nav className={styles.navigation} aria-label="Public pages">
          <Link to="/">Sign in</Link>
        </nav>
      </div>
    </header>
    <main className={styles.main}>{children}</main>
    <PublicFooter />
  </div>
}

export function AboutPage() {
  return <PublicLayout>
    <p className="eyebrow">TEAM 8044</p>
    <h1>Denham Venom Student Status</h1>
    <p className={styles.intro}>A place for approved team members and families to coordinate enrollment, events, attendance, travel readiness, permission forms and team finances.</p>
    <p>DS Robotics Foundation operates Denham Venom Team 8044 and these team apps.</p>
    <section className={styles.card} aria-labelledby="access-heading">
      <h2 id="access-heading">Team access</h2>
      <p>Students and staff use the Google account connected to their team profile. Invited parents can also sign in through a private emailed link or email code. Signing in does not automatically grant access to team records; the Coach approves enrollment and assigns team roles, and parents confirm their invited family relationship.</p>
      <Link className="button button-primary" to="/">Go to sign in</Link>
    </section>
    <section className={styles.section} aria-labelledby="timeclock-heading">
      <h2 id="timeclock-heading">Timeclock</h2>
      <p>The companion Timeclock app helps the team view approved meeting times and record attendance. Access to either app depends on your approved role.</p>
    </section>
    <p className={styles.contact}>Questions? Contact <a href="mailto:admin@team8044.org">admin@team8044.org</a>.</p>
  </PublicLayout>
}

export function PrivacyPage() {
  return <PublicLayout>
    <p className="eyebrow">STUDENT STATUS &amp; TIMECLOCK</p>
    <h1>Privacy notice</h1>
    <p className="muted">Updated October 17, 2026</p>
    <section className={styles.section} aria-labelledby="purpose-heading">
      <h2 id="purpose-heading">How the apps are used</h2>
      <p>DS Robotics Foundation operates Student Status and Timeclock for Denham Venom Team 8044 to coordinate team enrollment, student and parent setup, attendance, event readiness, permission forms and team financial participation.</p>
    </section>
    <section className={styles.section} aria-labelledby="information-heading">
      <h2 id="information-heading">Information in the apps</h2>
      <p>Google sign-in provides account information such as your name, email address and profile image. Parent email sign-in verifies the email address receiving the private link or code. Depending on your role and what you submit, the apps also hold student and parent profiles, contact and emergency information, health information, attendance, participation and financial records, and permission-form evidence. These records support team administration and event preparation.</p>
    </section>
    <section className={styles.section} aria-labelledby="access-privacy-heading">
      <h2 id="access-privacy-heading">Access</h2>
      <p>Access depends on your approved team role and family relationships. Signing in alone does not grant access to team records. The Coach approves enrollment and manages application roles. Authorized team staff and linked family members can access information appropriate to their responsibilities.</p>
    </section>
    <section className={styles.section} aria-labelledby="services-heading">
      <h2 id="services-heading">Services used</h2>
      <p>Google provides Google sign-in and the team calendar. Account information identifies your account and connects it to your approved team access. Resend delivers parent invitations and sign-in emails, receiving the destination address and the private link or code needed for that email. Convex processes and stores application records, and Cloudflare hosts the websites. Timeclock reads the team calendar separately; signing in does not give the apps access to your personal Google calendar.</p>
    </section>
    <section className={styles.section} aria-labelledby="retention-heading">
      <h2 id="retention-heading">Retention and review</h2>
      <p>Records are generally retained for five years after a student’s account is archived, then reviewed for deletion. Some records may be retained longer to support linked family accounts, resolve outstanding matters or meet preservation requirements. Deletion is not automatic.</p>
    </section>
    <section className={styles.section} aria-labelledby="exports-heading">
      <h2 id="exports-heading">Information on your device</h2>
      <p>The apps use browser storage to support sign-in, remember display preferences and complete invitation flows. Timeclock also remembers the device’s console identity.</p>
    </section>
    <section className={styles.section} aria-labelledby="contact-heading">
      <h2 id="contact-heading">Questions and corrections</h2>
      <p>To ask about your information or request access, a correction or a deletion review, contact <a href="mailto:admin@team8044.org">admin@team8044.org</a>. We may need to verify your identity before acting on a request. Some original records, including signed permission evidence, may need to be preserved.</p>
    </section>
  </PublicLayout>
}

export function TermsPage() {
  return <PublicLayout>
    <p className="eyebrow">STUDENT STATUS &amp; TIMECLOCK</p>
    <h1>Terms of use</h1>
    <p className="muted">Updated October 17, 2026</p>
    <section className={styles.section} aria-labelledby="authorized-use-heading">
      <h2 id="authorized-use-heading">Authorized team use</h2>
      <p>DS Robotics Foundation provides these apps for Denham Venom Team 8044 activities. Use them only if you have been approved for a team or family role, and only for the work and information that role allows.</p>
    </section>
    <section className={styles.section} aria-labelledby="accounts-heading">
      <h2 id="accounts-heading">Your account and submissions</h2>
      <p>Sign in with your own approved account. Keep private invitation links and sign-in codes to yourself. Keep your account secure, sign out when you finish using a shared device, and tell the Coach if you think someone else has used your access. Submit information you believe is accurate and ask for a correction when you find an error.</p>
    </section>
    <section className={styles.section} aria-labelledby="misuse-heading">
      <h2 id="misuse-heading">Misuse and access</h2>
      <p>Do not impersonate another person, view or change records outside your approved access, or try to bypass the apps’ controls. The Coach approves and manages team roles. Access may be changed or removed when it is no longer authorized or these terms are misused.</p>
    </section>
    <section className={styles.section} aria-labelledby="terms-support-heading">
      <h2 id="terms-support-heading">Help</h2>
      <p>For account or app questions, contact <a href="mailto:admin@team8044.org">admin@team8044.org</a>.</p>
    </section>
  </PublicLayout>
}
