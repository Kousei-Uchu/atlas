// Add a template from a file someone else made (M8-07, D-074). Opened, checked, shown in full, then
// added only after the person says they have read it. Nothing is fetched or sent.
import { useId, useState } from 'react';
import { COMMUNITY_TEMPLATE_NOTICE, ADULT_MODULE_NOTICE } from '../../content/notices.js';
import { addCommunityTemplate, reviewCommunityTemplate, COMMUNITY_LIMITS } from '../../domain/community-template.js';
import { newId } from '../../domain/ids.js';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function CommunityTemplate({ run, announce }) {
  const id = useId();
  const [state, setState] = useState(null); // { ok, template, review } | { ok: false, problems }
  const [read, setRead] = useState(false);
  const [inputKey, setInputKey] = useState(0);

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    setState(null);
    setRead(false);
    if (!file) return;
    if (file.size > COMMUNITY_LIMITS.fileBytes) {
      setState({ ok: false, problems: ['This file is larger than 256 KiB, so it was not opened.'] });
      return;
    }
    let text;
    try { text = await file.text(); } catch { setState({ ok: false, problems: ['This file could not be read.'] }); return; }
    const result = reviewCommunityTemplate(text);
    setState(result);
    announce(result.ok ? `Opened ${result.template.title}. Read it before adding it.` : 'This template file was not opened. The reasons are listed.');
  };

  const add = () => {
    const result = run(addCommunityTemplate, { template: state.template, makeId: newId });
    if (!result.ok) return;
    announce(`Added ${plural(result.added.categories, 'category', 'categories')} and ${plural(result.added.items, 'item', 'items')} from ${state.template.title}, all hidden. No answers were added.`);
    setState(null);
    setRead(false);
    setInputKey((k) => k + 1);
  };

  return (
    <div className="panel-block" aria-labelledby={`${id}-title`} role="group">
      <h3 id={`${id}-title`}>Add a template from a file</h3>
      <p className="hint">{COMMUNITY_TEMPLATE_NOTICE}</p>
      <label htmlFor={`${id}-file`}>Template file (.json)</label>
      <input key={inputKey} id={`${id}-file`} type="file" accept="application/json,.json" onChange={onFile} />

      {state && !state.ok && (
        <div className="hint" data-testid="community-problems">
          <p>This file was not opened:</p>
          <ul>{state.problems.map((p, i) => <li key={`${i}-${p}`}>{p}</li>)}</ul>
        </div>
      )}

      {state?.ok && (
        <div data-testid="community-preview">
          <h4>{state.template.title}</h4>
          <p>{state.template.summary}</p>
          <p className="hint">
            {plural(state.review.categories, 'category', 'categories')}, {plural(state.review.items, 'item', 'items')}
            {state.review.textItems > 0 ? `, ${plural(state.review.textItems, 'is a text item', 'are text items')} that start empty` : ''}.
            {' '}Everything is added hidden, and never more open than {state.review.floor}.
          </p>
          {state.review.adultIntended && <p className="hint">This file says it is intended for adults. {ADULT_MODULE_NOTICE}</p>}
          {state.review.matureWording && <p className="hint">It includes direct wording. Both wordings are shown below, and the one that matches your wording setting is added.</p>}
          <ul className="review-list">
            {state.template.categories.map((c) => (
              <li key={c.key}>
                <details>
                  <summary>{c.name}{c.mature ? ` (direct wording: ${c.mature.name})` : ''}, {plural(c.items.length, 'item', 'items')}</summary>
                  <ul>
                    {c.items.map((i) => (
                      <li key={i.key}>
                        {i.label}{i.mature ? ` (direct wording: ${i.mature.label})` : ''}{i.type === 'text' ? ' (text you write)' : ''}
                        {i.description ? <span className="hint">{` ${i.description}`}</span> : null}
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
          <label className="checkbox-row">
            <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} />
            <span>I have read every item above</span>
          </label>
          <button type="button" disabled={!read} onClick={add}>Add as hidden categories</button>
        </div>
      )}
    </div>
  );
}
