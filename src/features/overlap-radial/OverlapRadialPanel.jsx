// Radial diagram and overlapping regions (M7-07, D-067). Two read-only pictures of the chart, each with a
// list that carries the same facts. It edits nothing (I-05) and works out nothing about the person (I-10).
//
//   - Radial diagram: one equal wedge per group, with a segment per answered state, as long as the number of
//     answers. Wedge size and order mean nothing. Counts only: no total, average or score.
//   - Overlap: two audiences, and which questions are answered for both, for one only, or for the other only.
//     Nothing says how alike two audiences are.
//   - The drawings are hidden from assistive technology and are not Tab stops. The lists are the content, with
//     every state written as text (I-09), and they reflow to any width, so nothing scrolls sideways.
import { useId, useMemo, useState } from 'react';
import { StateBadge } from '../../components/StateBadge.jsx';
import { PatternDefs } from '../../components/PatternDefs.jsx';
import { audienceOverlap } from '../../domain/audience-overlap.js';
import { radialSummary } from '../../domain/radial-summary.js';
import { layoutRadial, RADIAL } from '../../visualisations/radial/layout.js';

const MAX_ROWS = 100;
const plural = (n, one, many) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

function RadialDiagram({ summary, idBase }) {
  const shapes = useMemo(() => layoutRadial(summary.wedges, summary.longest), [summary]);
  return (
    <figure className="rd-figure">
      <svg viewBox={`0 0 ${RADIAL.size} ${RADIAL.size}`} className="rd-svg" aria-hidden="true" focusable="false">
        <PatternDefs idBase={idBase} states={summary.states} />
        {shapes.map((shape, i) => (
          <g key={summary.wedges[i].category.id}>
            {shape.segments.map((segment, j) => {
              const state = summary.wedges[i].counts[j].state;
              const fill = state.pattern && state.pattern !== 'solid' ? `url(#${idBase}-${state.pattern}-${state.textColor.replace('#', '')})` : null;
              return (
                <g key={state.id} style={{ '--state-bg': state.color, '--state-fg': state.textColor }}>
                  <path d={segment.path} className="rd-segment" />
                  {fill && <path d={segment.path} className="rd-pattern" fill={fill} />}
                </g>
              );
            })}
            <text x={shape.label.x} y={shape.label.y} textAnchor="middle" dominantBaseline="central" className="rd-number">{i + 1}</text>
          </g>
        ))}
      </svg>
    </figure>
  );
}

function Radial({ profile, idBase }) {
  const summary = useMemo(() => radialSummary(profile), [profile]);
  if (summary.wedges.length === 0) {
    return <p className="hint">The radial diagram has nothing to show until a group with questions is on the chart.</p>;
  }
  return (
    <>
      <p className="hint">
        Each numbered wedge is one group, and every wedge is the same size. Along a wedge, each segment is one state, as
        long as the number of answers in it. Unanswered questions are counted in the list only. Nothing is added up.
      </p>
      <RadialDiagram summary={summary} idBase={idBase} />
      <ol className="rd-list" aria-label="Groups, in the order of the diagram">
        {summary.wedges.map(({ category, counts, unanswered }) => (
          <li key={category.id}>
            <strong>{category.name}</strong>:{' '}
            {counts.length === 0 ? 'no answers yet' : counts.map(({ state, count }) => `${state.label} ${count}`).join(', ')}
            {unanswered > 0 ? `; ${unanswered} unanswered` : ''}.
          </li>
        ))}
      </ol>
      {summary.hiddenWedges > 0 && <p className="hint">{plural(summary.hiddenWedges, 'more group is', 'more groups are')} not drawn. They are all in the chart.</p>}
    </>
  );
}

function Rows({ title, rows, columns }) {
  if (rows.length === 0) return null;
  return (
    <>
      <h4>{title} ({rows.length})</h4>
      <ul className="ov-rows">
        {rows.slice(0, MAX_ROWS).map((row) => (
          <li key={row.item.id}>
            <span>{row.item.label}</span> <span className="hint">in {row.category.name}</span>{' '}
            {columns(row)}
          </li>
        ))}
      </ul>
      {rows.length > MAX_ROWS && <p className="hint">And {rows.length - MAX_ROWS} more.</p>}
    </>
  );
}

function Overlap({ profile }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const result = useMemo(() => (a && b ? audienceOverlap(profile, a, b) : null), [profile, a, b]);
  const nameOf = (id) => profile.audiences.find((x) => x.id === id)?.name ?? '';
  if (profile.audiences.length < 2) {
    return <p className="hint">To see an overlap, make two audiences in the Audiences panel.</p>;
  }
  const options = profile.audiences.map((x) => <option key={x.id} value={x.id}>{x.name}</option>);
  return (
    <>
      <p className="hint">
        This sorts the questions by what each audience sees: answered for both, or for only one of them. It does not say
        how alike two audiences are, and Unanswered is never a match.
      </p>
      <label className="field">
        <span>First audience</span>
        <select value={a} onChange={(event) => setA(event.target.value)}><option value="">Choose an audience</option>{options}</select>
      </label>
      <label className="field">
        <span>Second audience</span>
        <select value={b} onChange={(event) => setB(event.target.value)}><option value="">Choose an audience</option>{options}</select>
      </label>
      {result && !result.ok && <p className="hint" role="status">{result.error}</p>}
      {result?.ok && (
        <>
          <figure className="ov-figure">
            <svg viewBox="0 0 260 130" className="ov-svg" aria-hidden="true" focusable="false">
              <circle cx="95" cy="65" r="55" className="ov-circle" />
              <circle cx="165" cy="65" r="55" className="ov-circle" />
              <text x="62" y="65" textAnchor="middle" dominantBaseline="central" className="ov-count">{result.onlyA.length}</text>
              <text x="130" y="65" textAnchor="middle" dominantBaseline="central" className="ov-count">{result.same.length + result.different.length}</text>
              <text x="198" y="65" textAnchor="middle" dominantBaseline="central" className="ov-count">{result.onlyB.length}</text>
            </svg>
          </figure>
          <ul className="ov-summary" aria-label="Overlap in words">
            <li>Answered for {nameOf(a)} only: {result.onlyA.length}.</li>
            <li>Answered for both: {result.same.length + result.different.length} ({result.same.length} with the same answer, {result.different.length} with different answers).</li>
            <li>Answered for {nameOf(b)} only: {result.onlyB.length}.</li>
          </ul>
          <Rows title="Different answers" rows={result.different} columns={(row) => (
            <span className="ov-pair"><span>{nameOf(a)}: <StateBadge state={row.a} /></span> <span>{nameOf(b)}: <StateBadge state={row.b} /></span></span>
          )} />
          <Rows title="Same answer for both" rows={result.same} columns={(row) => <StateBadge state={row.a} />} />
          <Rows title={`Answered for ${nameOf(a)} only`} rows={result.onlyA} columns={(row) => <StateBadge state={row.a} />} />
          <Rows title={`Answered for ${nameOf(b)} only`} rows={result.onlyB} columns={(row) => <StateBadge state={row.b} />} />
        </>
      )}
    </>
  );
}

/** @param {{ profile: object }} props */
export function OverlapRadialPanel({ profile }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  return (
    <section className="panel" aria-labelledby={`${panelId}-title`}>
      <div className="panel-heading">
        <h2 id={`${panelId}-title`}>Radial diagram and overlaps</h2>
        <button type="button" aria-expanded={open} aria-controls={`${panelId}-body`} onClick={() => setOpen((v) => !v)}>
          {open ? 'Close radial diagram and overlaps' : 'Open radial diagram and overlaps'}
        </button>
      </div>
      {open && (
        <div id={`${panelId}-body`} className="panel-block">
          <h3>Radial diagram</h3>
          <Radial profile={profile} idBase={`${panelId.replace(/:/g, '')}-rd`} />
          <h3>Overlap between two audiences</h3>
          <Overlap profile={profile} />
        </div>
      )}
    </section>
  );
}
