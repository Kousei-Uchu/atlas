import { ABOUT_SECTIONS, ABOUT_TITLE } from '../../content/about.js';

/** A plain, collapsed-by-default explanation of data handling. Text only; fixed wording (M6-05). */
export function AboutPanel() {
  return (
    <details className="about-panel">
      <summary>{ABOUT_TITLE}</summary>
      {ABOUT_SECTIONS.map((section) => (
        <section key={section.id} aria-labelledby={`about-${section.id}`}>
          <h3 id={`about-${section.id}`}>{section.heading}</h3>
          {section.body.map((text) => <p key={text}>{text}</p>)}
        </section>
      ))}
    </details>
  );
}
