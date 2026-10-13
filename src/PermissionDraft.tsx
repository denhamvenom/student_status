import styles from './FamilyOperations.module.css';
import { familyCopy } from './lib/family-copy';

export default function PermissionDraft() {
  return <div className={`permission-draft ${styles.draft}`}>
    <div className="page-head"><div><p className="eyebrow">{familyCopy.permissionDraft.eyebrow}</p><h1>{familyCopy.permissionDraft.title}</h1><p className="muted lead">{familyCopy.permissionDraft.organization}</p></div></div>
    {familyCopy.permissionDraft.sections.map((section, index) => <section className="card" key={section.title} aria-label={index === 0 ? familyCopy.permissionDraft.draftStatusLabel : undefined}><h2>{section.title}</h2><p>{section.body}</p>{section.title === familyCopy.permissionDraft.sections[4].title && <div className="simple-list">{familyCopy.permissionDraft.medicationCategories.map(category => <div className="detail" key={category}><strong>{category}</strong><span>{familyCopy.permissionDraft.medicationChoices}</span></div>)}</div>}{'note' in section && <p className="muted">{section.note}</p>}</section>)}
  </div>;
}
