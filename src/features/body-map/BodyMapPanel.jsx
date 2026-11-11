// Body map (M7-01, D-061). A second way to answer the Body contact map module: the same items, drawn as
// regions. It only turns choices into the usual commands through `run` (I-05) and never edits anything itself.
//
//   - The list beside the map is the accessible way in: real buttons, one per region, the same as the chart.
//   - The drawn regions are for pointer and touch. They are hidden from assistive technology so nothing is
//     read twice, and they are not Tab stops. Colour is never the only cue: each region also shows the state's
//     icon and pattern, and its name and answer are in the list as text (I-09).
//   - The map shows one group at a time ("from friends", "from family"...), each with its own answers.
import { useId, useMemo, useState } from 'react';
import { StateIcon } from '../../components/StateBadge.jsx';
import { stepItemState } from '../../domain/commands.js';
import { bodyMapGroups, bodyMapRows } from '../../domain/body-map.js';
import { effectiveStateId, getState } from '../../domain/selectors.js';
import { StateCell } from '../editor/StateCell.jsx';
import { centre, VIEW_BOX, VIEWS } from '../../visualisations/body-map/geometry.js';

function Shape({ shape, ...props }) {
  return shape.kind === 'ellipse'
    ? <ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} {...props} />
    : <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx} {...props} />;
}

/** SVG pattern fills for the states that have one, drawn in that state's own text colour. */
function PatternDefs({ idBase, states }) {
  const seen = new Map();
  for (const s of states) if (s.pattern && s.pattern !== 'solid') seen.set(`${s.pattern}-${s.textColor}`, s);
  return (
    <defs>
      {[...seen.entries()].map(([key, s]) => (
        <pattern key={key} id={`${idBase}-${key.replace('#', '')}`} patternUnits="userSpaceOnUse" width="8" height="8">
          {s.pattern === 'dots' && <circle cx="4" cy="4" r="1.4" fill={s.textColor} />}
          {s.pattern === 'stripes' && <path d="M-1 9L9 -1M-1 1L1 -1M7 9L9 7" stroke={s.textColor} strokeWidth="1.6" />}
          {s.pattern === 'dashed' && <path d="M0 4H4" stroke={s.textColor} strokeWidth="1.6" />}
        </pattern>
      ))}
    </defs>
  );
}

function Figure({ view, rows, idBase, active, onAction, onActive }) {
  const states = rows.map((r) => r.state).filter(Boolean);
  return (
    <figure className="bm-figure">
      <figcaption>{view.label}</figcaption>
      <svg viewBox={`0 0 ${VIEW_BOX.width} ${VIEW_BOX.height}`} className="bm-svg" aria-hidden="true" focusable="false">
        <PatternDefs idBase={idBase} states={states} />
        {rows.map(({ region, item, state }) => {
          const shapes = view.shapes[region.id];
          if (!shapes) return null;
          const missing = !item || !state;
          const c = centre(shapes[0]);
          const fill = state && state.pattern && state.pattern !== 'solid' ? `url(#${idBase}-${state.pattern}-${state.textColor.replace('#', '')})` : null;
          return (
            <g
              key={region.id}
              className="bm-region"
              data-active={active === region.id || undefined}
              data-missing={missing || undefined}
              style={state ? { '--state-bg': state.color, '--state-fg': state.textColor } : undefined}
              onClick={missing ? undefined : () => onAction(item.id, 'primary', region.label)}
              onContextMenu={missing ? undefined : (event) => { event.preventDefault(); onAction(item.id, 'secondary', region.label); }}
              onMouseEnter={() => onActive(region.id)}
              onMouseLeave={() => onActive(null)}
            >
              {shapes.map((shape, i) => <Shape key={i} shape={shape} className="bm-shape" />)}
              {fill && shapes.map((shape, i) => <Shape key={`p${i}`} shape={shape} className="bm-pattern" fill={fill} />)}
              {!missing && (
                <g transform={`translate(${c.x - 9} ${c.y - 9})`} className="bm-icon"><StateIcon name={state.icon} /></g>
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/**
 * @param {{ profile: object, run: Function, announce: (t: string) => void }} props
 */
export function BodyMapPanel({ profile, run, announce }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState(null);
  const [active, setActive] = useState(null);

  const groups = useMemo(() => bodyMapGroups(profile), [profile]);
  const group = groups.find((g) => g.id === chosen) ?? groups[0] ?? null;
  const { rows, others } = useMemo(() => (group ? bodyMapRows(profile, group.id) : { rows: [], others: 0 }), [profile, group]);

  const onAction = (itemId, kind, regionLabel) => {
    const result = run(stepItemState, { itemId, action: kind });
    if (!result.ok) return;
    const state = getState(result.profile, effectiveStateId(result.profile, itemId)).label;
    announce(result.clamped ? `${regionLabel}: already at the end, still ${state}` : `${regionLabel}: ${state}`);
  };

  return (
    <section className="panel" aria-labelledby={`${panelId}-title`}>
      <div className="panel-heading">
        <h2 id={`${panelId}-title`}>Body map</h2>
        <button type="button" aria-expanded={open} aria-controls={`${panelId}-body`} onClick={() => setOpen((v) => !v)}>
          {open ? 'Close body map' : 'Open body map'}
        </button>
      </div>
      {open && (
        <div id={`${panelId}-body`} className="panel-block">
          {!group ? (
            <p className="hint">
              The body map shows the Body contact map module. Add that module from the module library, and turn it on, to use the map.
            </p>
          ) : (
            <>
              <p className="hint">
                Choose who is touching, then answer for each part of the body. You can use the list or press a part on the map.
                The map has no private parts. The map and the list are the same answers as the chart. Press again for the next
                answer. Right click or Shift and Enter goes back.
              </p>
              <label className="field">
                <span>Who is touching</span>
                <select value={group.id} onChange={(event) => setChosen(event.target.value)}>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </label>

              <div className="bm-layout">
                <div className="bm-figures">
                  {Object.entries(VIEWS).map(([key, view]) => (
                    <Figure key={key} view={view} rows={rows} idBase={`${panelId}-${key}`.replace(/:/g, '')} active={active} onAction={onAction} onActive={setActive} />
                  ))}
                </div>

                <table className="bm-list">
                  <caption>{group.name}: one answer for each part of the body</caption>
                  <thead>
                    <tr><th scope="col">Part of the body</th><th scope="col">Answer</th></tr>
                  </thead>
                  <tbody>
                    {rows.map(({ region, item, state }) => (
                      <tr key={region.id} data-active={active === region.id || undefined}>
                        <th scope="row">{region.label}</th>
                        <td
                          onMouseEnter={() => setActive(region.id)}
                          onMouseLeave={() => setActive(null)}
                          onFocus={() => setActive(region.id)}
                          onBlur={() => setActive(null)}
                        >
                          {item && state ? (
                            <StateCell itemLabel={region.label} state={state} onAction={(kind) => onAction(item.id, kind, region.label)} />
                          ) : (
                            <span className="hint">Not in this chart. Add it back from the module library.</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {others > 0 && <p className="hint">{others === 1 ? '1 other item' : `${others} other items`} in this group are in the chart but not on the map.</p>}
            </>
          )}
        </div>
      )}
    </section>
  );
}
