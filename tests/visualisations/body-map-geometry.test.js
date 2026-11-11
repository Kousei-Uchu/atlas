// M7-01: the body map geometry is consistent with its template and draws no private parts (D-061).
import { describe, expect, it } from 'vitest';
import { REGIONS, VIEWS, VIEW_BOX, BODY_MAP_VERSION, regionIdFromKey, regionKey, centre } from '../../src/visualisations/body-map/geometry.js';
import { getTemplate } from '../../src/content/templates/index.js';

const template = getTemplate('body-contact-map');
const box = (s) => (s.kind === 'ellipse'
  ? { x1: s.cx - s.rx, y1: s.cy - s.ry, x2: s.cx + s.rx, y2: s.cy + s.ry }
  : { x1: s.x, y1: s.y, x2: s.x + s.width, y2: s.y + s.height });

describe('geometry', () => {
  it('is versioned and has unique region ids with plain labels', () => {
    expect(BODY_MAP_VERSION).toBe(1);
    expect(new Set(REGIONS.map((r) => r.id)).size).toBe(REGIONS.length);
    expect(new Set(REGIONS.map((r) => r.label)).size).toBe(REGIONS.length);
    for (const r of REGIONS) expect(r.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it('puts every shape inside the drawing box', () => {
    for (const view of Object.values(VIEWS)) for (const shapes of Object.values(view.shapes)) for (const s of shapes) {
      const b = box(s);
      expect(b.x1).toBeGreaterThanOrEqual(0); expect(b.y1).toBeGreaterThanOrEqual(0);
      expect(b.x2).toBeLessThanOrEqual(VIEW_BOX.width); expect(b.y2).toBeLessThanOrEqual(VIEW_BOX.height);
    }
  });

  it('only names regions that exist, and every region is on at least one side', () => {
    const ids = new Set(REGIONS.map((r) => r.id));
    for (const view of Object.values(VIEWS)) for (const id of Object.keys(view.shapes)) expect(ids.has(id), id).toBe(true);
    for (const id of ids) expect(Object.values(VIEWS).some((v) => v.shapes[id]), id).toBe(true);
  });

  it('draws left and right as a mirrored pair', () => {
    for (const id of ['shoulders', 'upper-arms', 'forearms', 'hands', 'upper-legs', 'knees', 'lower-legs', 'feet']) {
      const [a, b] = VIEWS.front.shapes[id];
      expect(centre(a).x + centre(b).x, id).toBe(200);
      expect(centre(a).y, id).toBe(centre(b).y);
    }
  });

  it('keeps private parts out: no region is named for one', () => {
    const words = REGIONS.map((r) => `${r.id} ${r.label}`).join(' ');
    expect(words).not.toMatch(/genital|groin|breast|nipple|buttock|bottom|crotch|penis|vagina|vulva|anus|private/i);
  });

  it('keeps shapes in one region from covering another region\'s centre', () => {
    for (const view of Object.values(VIEWS)) {
      for (const [id, shapes] of Object.entries(view.shapes)) {
        const c = centre(shapes[0]);
        for (const [other, otherShapes] of Object.entries(view.shapes)) {
          if (other === id) continue;
          // the face sits on the head by design; nothing else may overlap
          if ((id === 'face' && other === 'head-hair') || (id === 'head-hair' && other === 'face')) continue;
          for (const o of otherShapes) {
            const b = box(o);
            const inside = c.x > b.x1 && c.x < b.x2 && c.y > b.y1 && c.y < b.y2;
            expect(inside, `${id} centre inside ${other}`).toBe(false);
          }
        }
      }
    }
  });
});

describe('the template matches the geometry', () => {
  it('has one item for every region in every group, with matching keys', () => {
    expect(template.categories.length).toBeGreaterThanOrEqual(3);
    for (const category of template.categories) {
      const ids = category.items.map((i) => regionIdFromKey(category.key, i.key));
      expect(ids, category.key).toEqual(REGIONS.map((r) => r.id));
      expect(category.sensitivity).toBe('restricted');
    }
  });

  it('builds and reads keys both ways, and refuses foreign keys', () => {
    expect(regionKey('map-friends', 'neck')).toBe('map-friends-neck');
    expect(regionIdFromKey('map-friends', 'map-friends-neck')).toBe('neck');
    expect(regionIdFromKey('map-friends', 'map-family-neck')).toBeNull();
    expect(regionIdFromKey('map-friends', 'map-friends-nope')).toBeNull();
    expect(regionIdFromKey('map-friends', 42)).toBeNull();
  });

  it('is hidden, adult-intended and restricted, as the spec table says', () => {
    expect(template.defaultVisibility).toBe('hidden');
    expect(template.adultIntended).toBe(true);
  });
});
