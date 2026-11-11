// Radial diagram and overlap drawing geometry, version 1 (M7-07, D-067). Pure data: no React, no storage.
// Nothing stored: the shapes are worked out from counts each time, in this versioned file (spec 13).

export const RADIAL_LAYOUT_VERSION = 1;
export const RADIAL = Object.freeze({ size: 320, centre: 160, inner: 28, outer: 140, gap: 0.02 });

const point = (angle, r) => [RADIAL.centre + r * Math.sin(angle), RADIAL.centre - r * Math.cos(angle)];
const fmt = (n) => Math.round(n * 100) / 100;

/** The path of a ring segment: from radius `r1` to `r2`, across the angles `a1` to `a2` (radians, clockwise from the top). */
export function segmentPath(a1, a2, r1, r2) {
  const [x1, y1] = point(a1, r2);
  const [x2, y2] = point(a2, r2);
  const [x3, y3] = point(a2, r1);
  const [x4, y4] = point(a1, r1);
  const large = a2 - a1 > Math.PI ? 1 : 0;
  return `M${fmt(x1)} ${fmt(y1)}A${r2} ${r2} 0 ${large} 1 ${fmt(x2)} ${fmt(y2)}L${fmt(x3)} ${fmt(y3)}A${r1} ${r1} 0 ${large} 0 ${fmt(x4)} ${fmt(y4)}Z`;
}

/**
 * Wedges are all the same size. Each wedge's segments are stacked outward, `count` units long, where the
 * longest wedge reaches the outer edge.
 * @param {Array<{ answered: number, counts: Array<{ count: number }> }>} wedges
 * @param {number} longest
 * @returns {Array<{ label: { x: number, y: number }, segments: Array<{ path: string }> }>}
 */
export function layoutRadial(wedges, longest) {
  const n = Math.max(wedges.length, 1);
  const unit = longest > 0 ? (RADIAL.outer - RADIAL.inner) / longest : 0;
  return wedges.map((wedge, i) => {
    const a1 = (i / n) * Math.PI * 2 + RADIAL.gap;
    const a2 = ((i + 1) / n) * Math.PI * 2 - RADIAL.gap;
    let r = RADIAL.inner;
    const segments = wedge.counts.map(({ count }) => {
      const next = r + count * unit;
      const path = segmentPath(a1, a2, r, next);
      r = next;
      return { path };
    });
    const [x, y] = point((a1 + a2) / 2, RADIAL.outer + 12);
    return { label: { x: fmt(x), y: fmt(y) }, segments };
  });
}
