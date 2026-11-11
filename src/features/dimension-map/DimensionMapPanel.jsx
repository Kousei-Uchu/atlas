// Dimension map (M7-02, D-062). A second way to answer the Attraction and Gender identity and expression
// modules: every item is its own axis, and a person picks the state directly instead of clicking through the
// cycle. It only turns choices into the usual command through `run` (I-05).
//
//   - Each axis is a radio group (arrow keys move and choose; Tab leaves the group). The state is always
//     written as text next to its colour, icon and pattern (I-09).
//   - There is no combined picture: no score, no total, no line between axes, no label worked out from the
//     answers (I-10). The two modules are shown one at a time and never drawn together.
import { useId, useMemo, useState } from 'react';
import { StateBadge } from '../../components/StateBadge.jsx';
import { setItemState } from '../../domain/commands.js';
import { dimensionMaps, dimensionStops } from '../../domain/dimension-map.js';
import { getTemplate } from '../../content/templates/index.js';

function Axis({ row, stops, onChoose }) {
  const name = useId();
  const current = stops.findIndex((s) => s.id === row.state.id);
  const move = (event, index) => {
    const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!delta) return;
    event.preventDefault();
    const next = (index + delta + stops.length) % stops.length;
    onChoose(row.item, stops[next]);
    event.currentTarget.parentElement.querySelectorAll('[role=radio]')[next]?.focus();
  };
  return (
    <div className="dm-axis" role="radiogroup" aria-labelledby={`${name}-label`}>
      <span id={`${name}-label`} className="dm-label">{row.item.label}</span>
      <div className="dm-stops">
        {stops.map((state, index) => {
          const checked = state.id === row.state.id;
          return (
            <button
              key={state.id}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked || (current < 0 && index === 0) ? 0 : -1}
              className="dm-stop"
              data-checked={checked || undefined}
              onClick={() => onChoose(row.item, state)}
              onKeyDown={(event) => move(event, index)}
            >
              {checked ? <StateBadge state={state} /> : <span className="dm-stop-label">{state.label}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** @param {{ profile: object, run: Function, announce: (t: string) => void }} props */
export function DimensionMapPanel({ profile, run, announce }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState(null);

  const maps = useMemo(() => dimensionMaps(profile), [profile]);
  const stops = useMemo(() => dimensionStops(profile), [profile]);
  const map = maps.find((m) => m.templateId === chosen) ?? maps[0] ?? null;

  const onChoose = (item, state) => {
    const result = run(setItemState, { itemId: item.id, stateId: state.id });
    if (result.ok) announce(`${item.label}: ${state.label}`);
  };

  return (
    <section className="panel" aria-labelledby={`${panelId}-title`}>
      <div className="panel-heading">
        <h2 id={`${panelId}-title`}>Dimension map</h2>
        <button type="button" aria-expanded={open} aria-controls={`${panelId}-body`} onClick={() => setOpen((v) => !v)}>
          {open ? 'Close dimension map' : 'Open dimension map'}
        </button>
      </div>
      {open && (
        <div id={`${panelId}-body`} className="panel-block">
          {!map ? (
            <p className="hint">
              The dimension map shows the Attraction and the Gender identity and expression modules. Turn one of them on
              from the module library to use it.
            </p>
          ) : (
            <>
              <p className="hint">
                Each line is its own question, and you choose an answer for each one. The lines are not added up, and
                nothing here is used to work out a label for you. These are the same answers as the chart.
              </p>
              {maps.length > 1 && (
                <label className="field">
                  <span>Module</span>
                  <select value={map.templateId} onChange={(event) => setChosen(event.target.value)}>
                    {maps.map((m) => <option key={m.templateId} value={m.templateId}>{getTemplate(m.templateId).title}</option>)}
                  </select>
                </label>
              )}
              {map.groups.map(({ category, rows, textItems }) => (
                <section key={category.id} className="dm-group" aria-labelledby={`${panelId}-${category.id}`}>
                  <h3 id={`${panelId}-${category.id}`}>{category.name}</h3>
                  {rows.map((row) => <Axis key={row.item.id} row={row} stops={stops} onChoose={onChoose} />)}
                  {textItems > 0 && (
                    <p className="hint">{textItems === 1 ? '1 item in this group is' : `${textItems} items in this group are`} for your own words. They are in the chart.</p>
                  )}
                </section>
              ))}
            </>
          )}
        </div>
      )}
    </section>
  );
}
