// Path data for the state icons, as plain strings for SVG exports (I-09). The on-screen badge draws
// the same shapes in JSX. These are 24 by 24, stroked, with no fill unless noted.
export const ICON_SHAPES = Object.freeze({
  check: [{ d: 'M5 12.5l4.5 4.5L19 7.5' }],
  cross: [{ d: 'M6 6l12 12M18 6L6 18' }],
  question: [{ d: 'M9 9.5a3 3 0 1 1 4.6 2.5c-1 .7-1.6 1.2-1.6 2.5' }, { d: 'M12 18v.01' }],
  tilde: [{ d: 'M4 12c2-4 4-4 6 0s4 4 6 0 3-3 4-2' }],
  dash: [{ d: 'M6 12h12' }],
  circle: [{ circle: [12, 12, 6.5] }],
  dot: [{ circle: [12, 12, 3], fill: true }],
  star: [{ d: 'M12 4l2.4 5 5.5.7-4 3.8 1 5.5-4.9-2.7-4.9 2.7 1-5.5-4-3.8 5.5-.7z' }],
  heart: [{ d: 'M12 19s-6.5-4.2-6.5-9A3.7 3.7 0 0 1 12 7.8 3.7 3.7 0 0 1 18.5 10c0 4.8-6.5 9-6.5 9z' }],
  pause: [{ d: 'M9 6v12M15 6v12' }],
});

/** The icon's name in words, for the text description of an export. */
export const ICON_WORDS = Object.freeze({
  check: 'tick', cross: 'cross', question: 'question mark', tilde: 'wave', dash: 'dash',
  circle: 'empty circle', dot: 'dot', star: 'star', heart: 'heart', pause: 'pause',
});
