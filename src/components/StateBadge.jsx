// Shows a state by text label, icon and border/fill pattern, with colour as an extra
// cue only (I-09, M1-AC-05). The colours come from the profile's palette and are
// display-only (I-03).
//
// Colours are applied as CSS custom properties through the style prop. React sets
// these through the CSSOM, which the `style-src 'self'` policy allows.

// Simple 24x24 line icons. Decorative: the text label always carries the meaning.
const ICON_PATHS = {
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  cross: <path d="M6 6l12 12M18 6L6 18" />,
  question: (
    <>
      <path d="M9 9.5a3 3 0 1 1 4.6 2.5c-1 .7-1.6 1.2-1.6 2.5" />
      <path d="M12 18v.01" />
    </>
  ),
  tilde: <path d="M4 12c2-4 4-4 6 0s4 4 6 0 3-3 4-2" />,
  dash: <path d="M6 12h12" />,
  circle: <circle cx="12" cy="12" r="6.5" />,
  dot: <circle cx="12" cy="12" r="3" fill="currentColor" />,
  star: <path d="M12 4l2.4 5 5.5.7-4 3.8 1 5.5-4.9-2.7-4.9 2.7 1-5.5-4-3.8 5.5-.7z" />,
  heart: <path d="M12 19s-6.5-4.2-6.5-9A3.7 3.7 0 0 1 12 7.8 3.7 3.7 0 0 1 18.5 10c0 4.8-6.5 9-6.5 9z" />,
  pause: <path d="M9 6v12M15 6v12" />,
};

/** @param {{ name: string }} props */
export function StateIcon({ name }) {
  return (
    <svg
      className="state-icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICON_PATHS[name] ?? ICON_PATHS.circle}
    </svg>
  );
}

/**
 * @param {{ state: import('../domain/schema.js').State }} props
 */
export function StateBadge({ state }) {
  return (
    <span
      className="state-badge"
      data-pattern={state.pattern ?? 'solid'}
      data-semantic={state.semantic}
      style={{ '--state-bg': state.color, '--state-fg': state.textColor }}
    >
      <StateIcon name={state.icon} />
      <span className="state-badge-label">{state.label}</span>
    </span>
  );
}
