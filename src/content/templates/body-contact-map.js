// Template 23: body contact map (spec 12.2, M7-01, D-061). Where on the body a kind of touch is fine, by who.
// Platonic contact is first-class: the groups include friends and family. Only non-private regions are listed.
// Each category has the same regions, so the map can show one group at a time. The keys are `<group>-<region id>`
// and match src/visualisations/body-map/geometry.js. Not applicable is always a fair answer.
import { REGIONS, regionKey } from '../../visualisations/body-map/geometry.js';

// Keys and labels are unique across a template, so each includes the group.
const group = (key, name, description, who) => ({
  key,
  name,
  description,
  sensitivity: 'restricted',
  items: REGIONS.map((region) => ({
    key: regionKey(key, region.id),
    label: `Touch from ${who} on my ${region.label.toLowerCase()}`,
  })),
});

export default {
  templateId: 'body-contact-map',
  version: 1,
  title: 'Body contact map',
  summary: 'Where on your body touch is fine, by who is touching. Shown as a map and as a list. Private parts are not on the map.',
  defaultVisibility: 'hidden',
  adultIntended: true,
  isSample: false,
  statement: 'preferences-not-consent',
  categories: [
    group('map-friends', 'Touch from friends', 'Where touch from a friend is fine.', 'a friend'),
    group('map-family', 'Touch from family', 'Where touch from family is fine.', 'family'),
    group('map-partner', 'Touch from a partner', 'Where touch from a partner is fine.', 'a partner'),
    group('map-new', 'Touch from someone I do not know well', 'Where touch from someone I have just met is fine.', 'someone I do not know well'),
    group('map-care', 'Touch from a carer or health worker', 'Where touch for care or treatment is fine.', 'a carer or health worker'),
  ],
};
