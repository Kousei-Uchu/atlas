// Search and category filter for the chart (spec 13, M2-05). Pure: no React, no browser APIs,
// and it only reads the profile (I-05).
//
// What is searched: an item's label, description and tags, plus the names of the categories
// it sits in. Notes and written answers are not searched (D-030). Every word typed must be
// found somewhere in that text, so "touch hug" finds "A hug" under "Touch".
/** Lower-case, strip accents, collapse spaces. "Café  Time" and "cafe time" compare equal. */
export function normaliseText(text) {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** The words of a query, normalised. An empty query gives no words. */
export function searchTerms(query) {
  const text = normaliseText(query);
  return text === '' ? [] : text.split(' ');
}

function itemMatches(item, contextText, terms) {
  const haystack = normaliseText([contextText, item.label, item.description, ...(item.tags ?? [])].join(' '));
  return terms.every((term) => haystack.includes(term));
}

function findNode(nodes, categoryId) {
  for (const node of nodes) {
    if (node.category.id === categoryId) return node;
    const inside = findNode(node.children, categoryId);
    if (inside) return inside;
  }
  return null;
}

function prune(node, terms, parentContext) {
  const context = `${parentContext} ${node.category.name}`;
  const items = terms.length === 0 ? node.items : node.items.filter((item) => itemMatches(item, context, terms));
  const children = node.children.map((child) => prune(child, terms, context)).filter(Boolean);
  if (terms.length > 0 && items.length === 0 && children.length === 0) return null;
  return { ...node, items, children };
}

function countOf(nodes) {
  return nodes.reduce(
    (total, node) => {
      const inner = countOf(node.children);
      return { items: total.items + node.items.length + inner.items, categories: total.categories + 1 + inner.categories };
    },
    { items: 0, categories: 0 },
  );
}

/**
 * Narrow a category tree (from `getCategoryTree`) by a search query and/or one category.
 * A category filter shows that category and everything beneath it. A category id that is
 * not in the tree (deleted, or hidden) is ignored, so a stale filter never empties the chart.
 * @param {{ category: object, items: object[], children: object[] }[]} tree
 * @param {{ query?: string, categoryId?: string|null }} filter
 * @returns {{ tree: object[], active: boolean, itemCount: number, categoryCount: number, totalItems: number }}
 */
export function filterTree(tree, { query = '', categoryId = null } = {}) {
  const terms = searchTerms(query);
  const scoped = categoryId ? findNode(tree, categoryId) : null;
  const roots = scoped ? [scoped] : tree;
  const narrowed = roots.map((node) => prune(node, terms, '')).filter(Boolean);
  const shown = countOf(narrowed);
  return {
    tree: narrowed,
    active: terms.length > 0 || scoped !== null,
    itemCount: shown.items,
    categoryCount: shown.categories,
    totalItems: countOf(tree).items,
  };
}

/** Every visible category as a flat list with its depth, for the category filter menu. */
export function categoryChoices(tree) {
  const out = [];
  const walk = (nodes, depth) => {
    for (const node of nodes) {
      out.push({ id: node.category.id, name: node.category.name, depth });
      walk(node.children, depth + 1);
    }
  };
  walk(tree, 0);
  return out;
}
