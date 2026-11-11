// Relationship graph layout, version 1 (M7-06, D-066). Pure data: no React, no storage.
//
// The profile stores audiences and which one sits inside which (`parentId`). It never stores a position (spec 13).
// Positions are worked out here from that structure, in a versioned file, so the drawing can change without
// touching anyone's data. "Me" is the first column; every audience sits one column to the right of its parent,
// and rows follow the reading order of the list, so the picture and the list always agree.

export const GRAPH_LAYOUT_VERSION = 1;
export const CELL = Object.freeze({ width: 170, height: 54, nodeWidth: 140, nodeHeight: 34, margin: 10 });

/**
 * @param {Array<{ id: string, depth: number, parentId: string | null }>} ordered nodes in reading order (not "me")
 * @returns {{ width: number, height: number, nodes: Array<{ id: string, x: number, y: number }>, me: { x: number, y: number },
 *   edges: Array<{ from: string | 'me', to: string, x1: number, y1: number, x2: number, y2: number }> }}
 */
export function layoutGraph(ordered) {
  const maxDepth = ordered.reduce((m, n) => Math.max(m, n.depth), 0);
  const rows = Math.max(ordered.length, 1);
  const width = (maxDepth + 2) * CELL.width + CELL.margin * 2 - (CELL.width - CELL.nodeWidth);
  const height = rows * CELL.height + CELL.margin * 2;
  const at = (depth, row) => ({ x: CELL.margin + depth * CELL.width, y: CELL.margin + row * CELL.height + (CELL.height - CELL.nodeHeight) / 2 });
  const me = at(0, (rows - 1) / 2);
  const placed = new Map(ordered.map((n, row) => [n.id, at(n.depth + 1, row)]));
  const nodes = ordered.map((n) => ({ id: n.id, ...placed.get(n.id) }));
  const edges = ordered.map((n) => {
    const from = n.parentId === null ? me : placed.get(n.parentId);
    const to = placed.get(n.id);
    return {
      from: n.parentId === null ? 'me' : n.parentId,
      to: n.id,
      x1: from.x + CELL.nodeWidth,
      y1: from.y + CELL.nodeHeight / 2,
      x2: to.x,
      y2: to.y + CELL.nodeHeight / 2,
    };
  });
  return { width, height, nodes, me, edges };
}
