// Colour contrast helpers (spec 8, M2-03). Pure functions, no React and no browser APIs.
//
// Contrast is advice only. A low ratio produces a warning, never a refusal, because the
// colours are display-only (I-03) and a state is always told apart by its text label, icon
// and border pattern as well (I-09). The ratio follows WCAG 2.x relative luminance.

const HEX = /^#[0-9A-Fa-f]{6}$/;

/** Minimum ratio for normal-size text (WCAG AA). State labels are bold 16px, which is not "large". */
export const TEXT_MIN_RATIO = 4.5;
/** Ratio at which text reads comfortably (WCAG AAA). */
export const TEXT_GOOD_RATIO = 7;
/** Minimum ratio for icons and borders (WCAG non-text contrast). */
export const GRAPHIC_MIN_RATIO = 3;

/**
 * Turn "#RRGGBB" into [r, g, b] (0 to 255), or null when the text is not a full hex colour.
 * @param {string} hex
 * @returns {[number, number, number] | null}
 */
export function parseHex(hex) {
  if (typeof hex !== 'string' || !HEX.test(hex)) return null;
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

/** Linearise one sRGB channel (0 to 255). */
function channel(value) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/**
 * Relative luminance, 0 (black) to 1 (white).
 * @param {[number, number, number]} rgb
 */
export function relativeLuminance([r, g, b]) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Contrast ratio between two hex colours, 1 to 21, or null if either is not a valid hex colour.
 * @param {string} a
 * @param {string} b
 * @returns {number | null}
 */
export function contrastRatio(a, b) {
  const first = parseHex(a);
  const second = parseHex(b);
  if (!first || !second) return null;
  const la = relativeLuminance(first);
  const lb = relativeLuminance(second);
  const [light, dark] = la >= lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

/** Round to one decimal for display without ever rounding a failing ratio up to a pass. */
function display(ratio) {
  return Math.floor(ratio * 10) / 10;
}

/**
 * Judge a state's text-and-border colour against its background colour.
 *
 * `level` is "good" (7 or more), "ok" (4.5 or more), "low" (3 to 4.5, readable as a border
 * but weak as text) or "poor" (under 3). Only "low" and "poor" warrant a warning.
 *
 * @param {string} background
 * @param {string} foreground
 * @returns {{ ratio: number, shown: number, level: 'good' | 'ok' | 'low' | 'poor', warn: boolean } | null}
 *   null when either colour is not a valid hex code (nothing to judge yet).
 */
export function assessStateContrast(background, foreground) {
  const ratio = contrastRatio(background, foreground);
  if (ratio === null) return null;
  let level = 'poor';
  if (ratio >= TEXT_GOOD_RATIO) level = 'good';
  else if (ratio >= TEXT_MIN_RATIO) level = 'ok';
  else if (ratio >= GRAPHIC_MIN_RATIO) level = 'low';
  return { ratio, shown: display(ratio), level, warn: level === 'low' || level === 'poor' };
}

/**
 * Plain-language warning for an assessment, or null when no warning is needed.
 * The text explains what to do and says the state stays readable by label and icon.
 * @param {ReturnType<typeof assessStateContrast>} assessment
 * @returns {string | null}
 */
export function contrastWarningText(assessment) {
  if (!assessment || !assessment.warn) return null;
  const ratio = `${assessment.shown.toFixed(1)} to 1`;
  const advice = 'Try a darker or lighter text colour, or a different background.';
  if (assessment.level === 'poor') {
    return `Low contrast: ${ratio}. The label may be hard to read. ${advice} The state is still told apart by its name and icon.`;
  }
  return `Weak contrast: ${ratio}. Text needs at least 4.5 to 1 to be easy to read. ${advice}`;
}
