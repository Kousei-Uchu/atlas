// A plain, always-visible statement block. Used for the fixed notices in
// src/content/notices.js (I-02, M1-AC-11). Text only; never HTML.

/**
 * @param {{ title: string, children: string, tone?: 'info'|'caution' }} props
 */
export function Notice({ title, children, tone = 'info' }) {
  return (
    <section className="notice" data-tone={tone} aria-label={title}>
      <h2 className="notice-title">{title}</h2>
      <p className="notice-text">{children}</p>
    </section>
  );
}
