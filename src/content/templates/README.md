# Templates

A template is a versioned data file that adds categories and items to a profile. Templates hold
definitions only. They never hold answers, and they are bundled with the app, so nothing is
fetched when one is used.

## Writing one

Copy a small file such as `communication.js`. The shape is checked by `src/domain/templates.js`.

- `templateId` is stable and never reused. It is stored on every category and item made from the
  template, as `origin.templateId`.
- `version` goes up by one whenever the content changes in a way that matters. Update and reset
  (M3-06) compare it with `origin.templateVersion`.
- `key` on a category or item is its stable name inside the template. Keys are unique across the
  whole template. Never change a key once a template has shipped, or reset and update lose track
  of the entry. Change the label instead.
- `type` is `state` (the default) or `text`. A text item holds only what the person writes. A
  template never fills one in.
- An item with no `sensitivity` takes its category's. Sensitivity can be `normal`, `personal`,
  `sensitive` or `restricted`.
- A template with any restricted content must set `defaultVisibility: 'hidden'`. A template about
  relationships, intimacy, attraction or the body also sets `adultIntended: true`, which shows the
  adult note before it is turned on. The emergency card is restricted but not for adults (D-037).
- Every template carries `statement: 'preferences-not-consent'`. The wording is in
  `src/content/notices.js` and is shown with the template.

## Wording rules

- Plain, neutral and non-clinical. No diagnoses and no suggested labels.
- Friendly and platonic contact is ordinary content, not an edge case.
- Intimacy and attraction templates describe boundaries and preferences only.
- Items ask about words, contact and situations. They do not ask the person to pick or confirm a
  label for who they are.
- No em dashes, emoji or decorative symbols. The tests check this.
- Identity, attraction and anatomy templates (I-10): each kind of closeness is its own item, words
  that describe the person are text items that start empty, gender and bodies are never mentioned in
  the same template, and there are no identity or orientation labels anywhere.

## Reviewing the wording

`npm run templates:wording` writes `docs/TEMPLATE_WORDING.md`, a plain reading copy of every
template. Review that file rather than the source.
