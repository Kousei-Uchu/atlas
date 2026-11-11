// Relationship graph (M7-06, D-066). Shows the audiences as a graph with "Me" at the root, and the same facts
// as a nested list. The only edit is where an audience is placed, and it goes through `run` (I-05). It rates nothing: distance, size and colour carry no meaning (I-10).
//
//   - The nested list is the real content and the text alternative: each audience, its kind, and plain counts.
//   - The drawing is a picture of the same list and is hidden from assistive technology (I-09), because it adds no
//     information the list does not already have.
//   - Audiences are made and moved in the Audiences panel; this view only reads them.
import { useId, useMemo, useState } from 'react';
import { AUDIENCE_KIND_LABELS } from '../../content/audience-kinds.js';
import { setAudienceParent } from '../../domain/audience-commands.js';
import { relationshipGraph } from '../../domain/relationship-graph.js';
import { CELL, layoutGraph } from '../../visualisations/relationship-graph/layout.js';

const plural = (n, one, many) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

function facts(node) {
  const parts = [];
  if (node.overrides) parts.push(plural(node.overrides, 'change', 'changes'));
  if (node.views) parts.push(plural(node.views, 'saved view', 'saved views'));
  if (node.differing) parts.push(`${plural(node.differing, 'answer differs', 'answers differ')} from yours`);
  return parts.length ? parts.join(', ') : 'nothing set for this audience';
}

/** @param {{ profile: object, run: Function, announce: (t: string) => void }} props */
export function RelationshipGraphPanel({ profile, run, announce }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const { nodes } = useMemo(() => relationshipGraph(profile), [profile]);
  const layout = useMemo(() => layoutGraph(nodes.map((n) => ({ id: n.audience.id, depth: n.depth, parentId: n.parentId }))), [nodes]);
  const position = new Map(layout.nodes.map((n) => [n.id, n]));
  const parentOf = new Map(profile.audiences.map((a) => [a.id, a.parentId]));
  // An audience cannot be placed inside itself or inside one of its own, so those are not offered.
  const isWithin = (id, ancestorId) => {
    for (let cursor = id, hops = 0; cursor && hops <= profile.audiences.length; hops += 1) {
      if (cursor === ancestorId) return true;
      cursor = parentOf.get(cursor) ?? null;
    }
    return false;
  };
  const place = (audience, parentId) => {
    const result = run(setAudienceParent, { id: audience.id, parentId: parentId === '' ? null : parentId });
    if (result.ok) announce(parentId === '' ? `${audience.name} is at the top level` : `${audience.name} is inside ${profile.audiences.find((a) => a.id === parentId)?.name}`);
  };

  return (
    <section className="panel" aria-labelledby={`${panelId}-title`}>
      <div className="panel-heading">
        <h2 id={`${panelId}-title`}>Relationship graph</h2>
        <button type="button" aria-expanded={open} aria-controls={`${panelId}-body`} onClick={() => setOpen((v) => !v)}>
          {open ? 'Close relationship graph' : 'Open relationship graph'}
        </button>
      </div>
      {open && (
        <div id={`${panelId}-body`} className="panel-block">
          {nodes.length === 0 ? (
            <p className="hint">
              The relationship graph shows the audiences you make, with you at the centre. Add one in the Audiences
              panel to see it here.
            </p>
          ) : (
            <>
              <p className="hint">
                Each audience sits inside the one you placed it in. The numbers are counts of what you have set. Nothing
                here rates a relationship, and position and distance mean nothing. You can place an audience inside another here; make or rename audiences in the Audiences panel.
              </p>
              <div className="rg-figure">
                <svg
                  className="rg-svg"
                  viewBox={`0 0 ${layout.width} ${layout.height}`}
                  aria-hidden="true"
                  focusable="false"
                >
                  {layout.edges.map((e) => (
                    <path key={e.to} className="rg-edge" d={`M${e.x1} ${e.y1} C${e.x1 + 30} ${e.y1} ${e.x2 - 30} ${e.y2} ${e.x2} ${e.y2}`} />
                  ))}
                  <g className="rg-node rg-me">
                    <rect x={layout.me.x} y={layout.me.y} width={CELL.nodeWidth} height={CELL.nodeHeight} rx="8" />
                    <text x={layout.me.x + CELL.nodeWidth / 2} y={layout.me.y + CELL.nodeHeight / 2} textAnchor="middle" dominantBaseline="central">Me</text>
                  </g>
                  {nodes.map(({ audience }) => {
                    const p = position.get(audience.id);
                    const name = audience.name.length > 17 ? `${audience.name.slice(0, 16)}…` : audience.name;
                    return (
                      <g key={audience.id} className="rg-node">
                        <rect x={p.x} y={p.y} width={CELL.nodeWidth} height={CELL.nodeHeight} rx="8" />
                        <text x={p.x + CELL.nodeWidth / 2} y={p.y + CELL.nodeHeight / 2} textAnchor="middle" dominantBaseline="central">{name}</text>
                      </g>
                    );
                  })}
                </svg>
              </div>
              <ul className="rg-list" aria-label="Audiences, with you at the top">
                <li>
                  <strong>Me</strong>
                  <ul>
                    {nodes.map((n) => (
                      <li key={n.audience.id} style={{ marginLeft: `${n.depth}rem` }} data-depth={n.depth}>
                        <strong>{n.audience.name}</strong> ({AUDIENCE_KIND_LABELS[n.audience.type] ?? n.audience.type}
                        {n.depth > 0 ? ', inside the audience above' : ''}): {facts(n)}.
                        <label className="field rg-place">
                          <span>Place {n.audience.name} inside</span>
                          <select value={n.audience.parentId ?? ''} onChange={(event) => place(n.audience, event.target.value)}>
                            <option value="">Me (top level)</option>
                            {profile.audiences.filter((a) => !isWithin(a.id, n.audience.id)).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                        </label>
                      </li>
                    ))}
                  </ul>
                </li>
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
