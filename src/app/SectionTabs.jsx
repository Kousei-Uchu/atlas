// The tab bar for the app's sections (UX pass, D-076). A standard tab pattern: one tab stop,
// arrow keys, Home and End move between tabs, Enter or Space is not needed because focus selects.
// The panels stay mounted and are only hidden, so what a person was doing in one section
// (a filter, an open panel, a half-written name) is still there when they come back.
// No URL is used, because the fragment belongs to share links (D-017).
import { useRef } from 'react';

export const SECTIONS = [
  { id: 'chart', label: 'Chart' },
  { id: 'modules', label: 'Modules' },
  { id: 'explore', label: 'Explore' },
  { id: 'share', label: 'Share' },
  { id: 'settings', label: 'Settings' },
];

export function SectionTabs({ active, onChange }) {
  const refs = useRef({});
  const move = (event, index) => {
    let next = null;
    if (event.key === 'ArrowRight') next = (index + 1) % SECTIONS.length;
    else if (event.key === 'ArrowLeft') next = (index + SECTIONS.length - 1) % SECTIONS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = SECTIONS.length - 1;
    if (next === null) return;
    event.preventDefault();
    onChange(SECTIONS[next].id);
    refs.current[SECTIONS[next].id]?.focus();
  };
  return (
    <div className="section-tabs" role="tablist" aria-label="Sections">
      {SECTIONS.map((s, i) => (
        <button
          key={s.id}
          ref={(el) => { refs.current[s.id] = el; }}
          type="button"
          role="tab"
          id={`tab-${s.id}`}
          aria-selected={active === s.id}
          aria-controls={`panel-${s.id}`}
          tabIndex={active === s.id ? 0 : -1}
          onClick={() => onChange(s.id)}
          onKeyDown={(event) => move(event, i)}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

/** One section's content. Hidden, not unmounted, when it is not the active one. */
export function SectionPanel({ id, active, children }) {
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} hidden={active !== id} className="section-panel">
      {children}
    </div>
  );
}
