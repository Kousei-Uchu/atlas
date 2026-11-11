// Decision tree (M7-04, D-064). A read-only way to see the Overwhelm or support plan as a branching outline:
// "when it is getting too much" splits into the groups of the plan, and each group lists what the person
// wrote or chose. It edits nothing (I-05) and works out nothing from the answers (I-10).
//
//   - It is a nested list, so the list is its own text alternative. Each branch is a native disclosure
//     (details/summary), which works with Enter and Space and needs no drawing.
//   - A state is always written as text next to its colour, icon and pattern (I-09).
//   - Empty groups say so instead of disappearing. Unanswered items are not shown (I-01).
import { useId, useMemo, useState } from 'react';
import { StateBadge } from '../../components/StateBadge.jsx';
import { decisionTree } from '../../domain/decision-tree.js';

/** @param {{ profile: object }} props */
export function DecisionTreePanel({ profile }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const tree = useMemo(() => decisionTree(profile), [profile]);

  return (
    <section className="panel" aria-labelledby={`${panelId}-title`}>
      <div className="panel-heading">
        <h2 id={`${panelId}-title`}>Decision tree</h2>
        <button type="button" aria-expanded={open} aria-controls={`${panelId}-body`} onClick={() => setOpen((v) => !v)}>
          {open ? 'Close decision tree' : 'Open decision tree'}
        </button>
      </div>
      {open && (
        <div id={`${panelId}-body`} className="panel-block">
          {!tree ? (
            <p className="hint">
              The decision tree shows your Overwhelm or support plan as a branching outline. Turn that module on from the
              module library to use it.
            </p>
          ) : (
            <>
              <p className="hint">
                This outline only shows what you have written or chosen in the plan, in the plan's own order. It does not
                suggest anything, and you change the plan in the chart, not here.
              </p>
              <ul className="dt-tree" aria-label="When it is getting too much">
                {tree.branches.map(({ category, texts, groups, empty }) => (
                  <li key={category.id}>
                    <details open>
                      <summary>{category.name}</summary>
                      {empty ? (
                        <p className="hint">Nothing here yet.</p>
                      ) : (
                        <ul className="dt-leaves">
                          {texts.map(({ item, text }) => (
                            <li key={item.id}><strong>{item.label}:</strong> {text}</li>
                          ))}
                          {groups.map(({ state, items }) => (
                            <li key={state.id}>
                              <StateBadge state={state} />
                              <ul>
                                {items.map((item) => <li key={item.id}>{item.label}</li>)}
                              </ul>
                            </li>
                          ))}
                        </ul>
                      )}
                    </details>
                  </li>
                ))}
              </ul>
              {tree.leafCount === 0 && <p className="hint">The plan is on, but nothing has been written or chosen yet.</p>}
            </>
          )}
        </div>
      )}
    </section>
  );
}
