// Body map geometry, version 1 (M7-01, D-061). Pure data: no React, no storage.
//
// The profile stores which region an item is about (the key `<group>-<region id>`), never coordinates (spec 13).
// The shapes live here, in a versioned file, so a later drawing can change without touching anyone's answers.
//
// The map is an abstract set of shapes, not an outline of a body. It covers regions of the body that are
// not private parts: head, face, neck, shoulders, arms, hands, chest, stomach, back, hips and sides, legs,
// knees and feet. Private parts are never drawn. They stay in the Anatomy and compatibility module as text.
// A region that is not meant for a particular person can always be answered Not applicable.
//
// Coordinates are in a 200 x 400 box. Left and right are one region: a person answers for "Shoulders", and
// both shoulders show it.

export const BODY_MAP_VERSION = 1;
export const VIEW_BOX = Object.freeze({ width: 200, height: 400 });

const e = (cx, cy, rx, ry) => ({ kind: 'ellipse', cx, cy, rx, ry });
const r = (x, y, width, height, rx = 6) => ({ kind: 'rect', x, y, width, height, rx });
const pair = (shape, mirrorX) => [shape, shape.kind === 'ellipse' ? { ...shape, cx: 200 - shape.cx } : { ...shape, x: 200 - shape.x - shape.width }].slice(0, mirrorX === false ? 1 : 2);

/** The regions a person can answer about. `label` is plain words. Order is the reading order of the list. */
export const REGIONS = Object.freeze([
  { id: 'head-hair', label: 'Head and hair' },
  { id: 'face', label: 'Face' },
  { id: 'neck', label: 'Neck' },
  { id: 'shoulders', label: 'Shoulders' },
  { id: 'upper-arms', label: 'Upper arms' },
  { id: 'forearms', label: 'Forearms' },
  { id: 'hands', label: 'Hands' },
  { id: 'chest', label: 'Chest' },
  { id: 'stomach', label: 'Stomach' },
  { id: 'upper-back', label: 'Upper back' },
  { id: 'lower-back', label: 'Lower back' },
  { id: 'hips', label: 'Hips and sides' },
  { id: 'upper-legs', label: 'Upper legs' },
  { id: 'knees', label: 'Knees' },
  { id: 'lower-legs', label: 'Lower legs' },
  { id: 'feet', label: 'Feet' },
]);

const common = {
  neck: [r(92, 64, 16, 16, 4)],
  shoulders: pair(e(62, 92, 16, 12)),
  'upper-arms': pair(r(44, 100, 18, 52)),
  forearms: pair(r(40, 156, 16, 48)),
  hands: pair(e(48, 218, 9, 14)),
  hips: [r(70, 168, 60, 26, 10)],
  'upper-legs': pair(r(74, 198, 24, 80)),
  knees: pair(e(86, 288, 12, 10)),
  'lower-legs': pair(r(76, 302, 20, 70)),
  feet: pair(e(86, 388, 13, 8)),
};

/** Which shapes each view draws. A region missing from a view is simply not on that side. */
export const VIEWS = Object.freeze({
  front: {
    label: 'Front',
    shapes: {
      'head-hair': [e(100, 30, 25, 24)],
      face: [e(100, 42, 17, 19)],
      ...common,
      chest: [r(78, 84, 44, 44, 8)],
      stomach: [r(74, 130, 52, 36, 8)],
    },
  },
  back: {
    label: 'Back',
    shapes: {
      'head-hair': [e(100, 34, 25, 28)],
      ...common,
      'upper-back': [r(78, 84, 44, 44, 8)],
      'lower-back': [r(74, 130, 52, 36, 8)],
    },
  },
});

/** Centre of a region's first shape, used to place its state icon. */
export function centre(shape) {
  return shape.kind === 'ellipse'
    ? { x: shape.cx, y: shape.cy }
    : { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
}

/** The template key of one region's item inside one group: `<group key>-<region id>`. */
export const regionKey = (groupKey, regionId) => `${groupKey}-${regionId}`;
/** The region an item is about, from its group's key and its own key, or null. */
export function regionIdFromKey(groupKey, key) {
  const prefix = `${groupKey}-`;
  if (typeof key !== 'string' || !key.startsWith(prefix)) return null;
  const id = key.slice(prefix.length);
  return REGIONS.some((region) => region.id === id) ? id : null;
}
export const regionById = (id) => REGIONS.find((region) => region.id === id) ?? null;
