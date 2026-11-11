// Views and exports (M4-05, M4-06): build a view of selected items for one audience, review exactly
// what it would include and what is held back and why, then download it as Markdown, CSV, SVG or PNG.
//
// Only turns choices into domain commands through `run` (I-05). What a view includes is decided by
// `evaluateView` alone, and what an export contains comes from `buildExportModel` alone, so this
// screen shows the same thing the file will hold (I-11). Closed by default, like the other panels.
import { useId, useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { LIMITS } from '../../domain/limits.js';
import { newId } from '../../domain/ids.js';
import { effectiveSensitivity, getCategoryTree, getState } from '../../domain/selectors.js';
import {
  addView, addViewItems, deleteView, removeViewItems, renameView, setRestrictedOptIn, setViewAudience,
  setViewIncludeNotes, setViewIncludeSensitive,
} from '../../domain/view-commands.js';
import { evaluateView, REASON_TEXT } from '../../domain/view-inclusion.js';
import { buildExportModel } from '../../domain/export-model.js';
import { CONSENT_NOTICE } from '../../content/notices.js';
import { renderMarkdown } from '../../export/markdown.js';
import { renderCsv } from '../../export/csv.js';
import { renderSvg } from '../../export/svg.js';
import { svgToPngBlob } from '../../export/png.js';
import { exportFilename } from '../../export/filename.js';
import { downloadBlob } from '../import-export/download.js';
import { ShareLink } from './ShareLink.jsx';
import { InlineRename } from '../editor/InlineRename.jsx';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const LEVEL_TEXT = { sensitive: 'sensitive', restricted: 'restricted' };

function AudienceSelect({ id, profile, value, onChange }) {
  return (
    <select id={id} value={value ?? ''} onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}>
      <option value="">Everyone (my own answers)</option>
      {profile.audiences.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
  );
}

/** Picks items by category. Every checkbox is one item, so nothing is included by a hidden rule. */
function Picker({ profile, view, run }) {
  const picked = new Set(view.includedItemIds);
  const apply = (command, itemIds) => run(command, { id: view.id, itemIds });
  const render = ({ category, items, children }, trail) => {
    const name = [...trail, category.name].join(' / ');
    const ids = items.map((i) => i.id);
    const all = ids.length > 0 && ids.every((id) => picked.has(id));
    return (
      <fieldset key={category.id} className="picker-group">
        <legend>
          {name}
          {category.visibility === 'hidden' && <span className="hint"> (hidden category: its items are held back)</span>}
        </legend>
        {ids.length > 0 && (
          <div className="panel-actions">
            <button type="button" disabled={all} onClick={() => apply(addViewItems, ids)}>Pick all in {name}</button>
            <button type="button" disabled={!ids.some((id) => picked.has(id))} onClick={() => apply(removeViewItems, ids)}>Clear {name}</button>
          </div>
        )}
        <ul className="picker-list">
          {items.map((item) => {
            const level = LEVEL_TEXT[effectiveSensitivity(profile, item)];
            return (
              <li key={item.id}>
                <label className="checkbox-row">
                  <input type="checkbox" checked={picked.has(item.id)} onChange={(event) => apply(event.target.checked ? addViewItems : removeViewItems, [item.id])} />
                  <span>{item.label}{level && <>{' '}<span className="hint">({level})</span></>}</span>
                </label>
              </li>
            );
          })}
        </ul>
        {children.map((child) => render(child, [...trail, category.name]))}
      </fieldset>
    );
  };
  const tree = getCategoryTree(profile, { includeHidden: true });
  if (tree.length === 0) return <p className="hint">There are no categories yet.</p>;
  return <div className="picker">{tree.map((node) => render(node, []))}</div>;
}

/** Everything the view would include, and everything it holds back, with the reason for each. */
function Review({ profile, view, evaluation, run, announce }) {
  const stateLabel = (stateId) => getState(profile, stateId)?.label ?? 'Unanswered';
  const opted = new Set(view.restrictedOptInItemIds);
  const optIn = (entry, on) => {
    const result = run(setRestrictedOptIn, { id: view.id, itemId: entry.itemId, optIn: on });
    if (result.ok) announce(`${entry.label} is ${on ? 'now' : 'no longer'} included in this view`);
  };
  const restrictedBox = (entry) => (
    <label className="checkbox-row">
      <input type="checkbox" checked={opted.has(entry.itemId)} onChange={(event) => optIn(entry, event.target.checked)} />
      <span>Include {entry.label} in this view (restricted)</span>
    </label>
  );
  return (
    <section className="panel-block" aria-label="Review" data-testid="review">
      <h4>Review: what this view will include</h4>
      <p data-testid="review-counts">
        {plural(evaluation.counts.included, 'item', 'items')} included, {plural(evaluation.counts.held, 'item', 'items')} held back
        {evaluation.counts.notes > 0 ? `, ${plural(evaluation.counts.notes, 'note', 'notes')} included` : ''}.
      </p>
      {!evaluation.buildable && (
        <p className="banner" role="alert" data-tone="error">
          {evaluation.problems[0] ?? 'Some items have overrides that disagree for this audience, so this view cannot be exported yet. Keep one of each in Audiences.'}
        </p>
      )}

      <h5>Included</h5>
      {evaluation.included.length === 0 ? <p className="hint">Nothing is included yet.</p> : (
        <ul className="review-list">
          {evaluation.included.map((e) => (
            <li key={e.itemId}>
              <strong>{e.label}</strong>:{' '}
              {e.value.kind === 'state' ? stateLabel(e.value.stateId) : (e.value.text.trim() === '' ? 'nothing written' : 'the text you wrote')}
              {e.value.kind === 'state' && e.value.source === 'override' && <span className="hint"> (audience override{e.value.moreOpenThanDefault ? ', shows more than your own answer' : ''})</span>}
              {e.note !== null && <span className="hint"> (with its note)</span>}
              {e.sensitivity === 'restricted' && restrictedBox(e)}
            </li>
          ))}
        </ul>
      )}

      <h5>Held back</h5>
      {evaluation.held.length === 0 ? <p className="hint">Nothing you picked is held back.</p> : (
        <ul className="review-list">
          {evaluation.held.map((e) => (
            <li key={e.itemId}>
              <strong>{e.label}</strong>: {REASON_TEXT[e.reason]}
              {e.reason === 'restricted' && restrictedBox(e)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Exporter({ profile, view, evaluation, now, saveFile, saveBlob, makePng, announce, pageUrl, copyText }) {
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);
  const previewId = useId();
  const ready = evaluation.buildable && evaluation.included.length > 0;
  const model = () => buildExportModel(profile, view, { generatedAt: now() });

  const download = async (format) => {
    setError('');
    const built = model();
    if (!built.ok) { setError(built.error); return; }
    const date = built.model.date;
    try {
      if (format === 'md') saveFile(exportFilename(view.name, date, 'md'), renderMarkdown(built.model), 'text/markdown');
      else if (format === 'csv') saveFile(exportFilename(view.name, date, 'csv'), renderCsv(built.model), 'text/csv');
      else {
        const picture = renderSvg(built.model);
        if (format === 'svg') saveFile(exportFilename(view.name, date, 'svg'), picture.svg, 'image/svg+xml');
        else saveBlob(exportFilename(view.name, date, 'png'), await makePng(picture.svg, picture));
      }
      announce(`Downloaded ${view.name} as ${format === 'md' ? 'Markdown' : format.toUpperCase()}`);
    } catch {
      setError('The file could not be made in this browser. Try another format.');
    }
  };
  const built = preview && ready ? model() : null;

  return (
    <section className="panel-block" aria-label="Export">
      <h4>Export</h4>
      <p className="hint">Every export carries this statement and a key to its states: {CONSENT_NOTICE}</p>
      <div className="panel-actions">
        <button type="button" disabled={!ready} onClick={() => download('md')}>Download Markdown</button>
        <button type="button" disabled={!ready} onClick={() => download('csv')}>Download CSV spreadsheet</button>
        <button type="button" disabled={!ready} onClick={() => download('svg')}>Download SVG picture</button>
        <button type="button" disabled={!ready} onClick={() => download('png')}>Download PNG picture</button>
        <button type="button" disabled={!ready} aria-expanded={preview} aria-controls={previewId} onClick={() => setPreview((v) => !v)}>
          {preview ? 'Hide Markdown preview' : 'Show Markdown preview'}
        </button>
      </div>
      {!ready && <p className="hint">{evaluation.buildable ? 'Pick at least one item that can be included to export.' : 'Settle the problem above to export.'}</p>}
      {error && <p className="banner" role="alert" data-tone="error">{error}</p>}
      {built?.ok && <textarea id={previewId} className="export-preview" readOnly rows={14} aria-label="Markdown preview" value={renderMarkdown(built.model)} />}
      <ShareLink profile={profile} view={view} ready={ready} now={now} announce={announce} onDownloadFile={() => download('md')} pageUrl={pageUrl} copyText={copyText} />
    </section>
  );
}

function ViewBuilder({ profile, view, run, announce, now, saveFile, saveBlob, makePng, pageUrl, copyText }) {
  const id = useId();
  const evaluation = evaluateView(profile, view);
  return (
    <div className="view-builder panel-block">
      <div className="panel-actions">
        <InlineRename label={`view ${view.name}`} value={view.name} maxLength={LIMITS.categoryNameLength} onSave={(name) => run(renameView, { id: view.id, name })} />
      </div>
      <div className="panel-block">
        <label htmlFor={`${id}-audience`}>Who this view is for</label>
        <AudienceSelect id={`${id}-audience`} profile={profile} value={view.audienceId} onChange={(audienceId) => run(setViewAudience, { id: view.id, audienceId })} />
      </div>
      <label className="checkbox-row">
        <input type="checkbox" checked={view.includeSensitive} onChange={(e) => run(setViewIncludeSensitive, { id: view.id, includeSensitive: e.target.checked })} />
        <span>Include sensitive items that I pick. Restricted items always need their own choice.</span>
      </label>
      <label className="checkbox-row">
        <input type="checkbox" checked={view.includeNotes} onChange={(e) => run(setViewIncludeNotes, { id: view.id, includeNotes: e.target.checked })} />
        <span>Include notes, but only notes I have allowed to be shared on the item.</span>
      </label>

      <h4>Pick items</h4>
      <p className="hint">Nothing is included until you pick it. Held-back items are listed in the review.</p>
      <Picker profile={profile} view={view} run={run} />

      <Review profile={profile} view={view} evaluation={evaluation} run={run} announce={announce} />
      <Exporter profile={profile} view={view} evaluation={evaluation} now={now} saveFile={saveFile} saveBlob={saveBlob} makePng={makePng} announce={announce} pageUrl={pageUrl} copyText={copyText} />
    </div>
  );
}

/**
 * @param {{
 *   profile: import('../../domain/schema.js').Profile,
 *   run: (command: Function, args: object, options?: object) => { ok: boolean },
 *   announce: (text: string) => void,
 *   now: () => string,
 *   saveFile: (filename: string, text: string, type?: string) => void,
 *   saveBlob?: (filename: string, blob: Blob) => void,
 *   makePng?: (svg: string, size: { width: number, height: number }) => Promise<Blob>,
 * }} props
 */
export function ViewsPanel({ profile, run, announce, now, saveFile, saveBlob = downloadBlob, makePng = svgToPngBlob, pageUrl, copyText }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [openViewId, setOpenViewId] = useState(null);
  const [doomed, setDoomed] = useState(null);
  const [name, setName] = useState('');
  const [audienceId, setAudienceId] = useState(null);

  const create = (event) => {
    event.preventDefault();
    const viewId = newId('view');
    const result = run(addView, { id: viewId, name, audienceId });
    if (result.ok) { setName(''); setOpenViewId(viewId); announce(`Made the view ${name.trim()}. It includes nothing until you pick items.`); }
  };
  const confirmDelete = () => {
    const target = doomed;
    setDoomed(null);
    if (run(deleteView, { id: target.id }).ok) {
      if (openViewId === target.id) setOpenViewId(null);
      announce(`Deleted the view ${target.name}. Your answers are not changed.`);
    }
  };
  const audienceName = (view) => (view.audienceId === null ? 'Everyone (my own answers)' : profile.audiences.find((a) => a.id === view.audienceId)?.name ?? 'an audience that no longer exists');

  return (
    <section className="panel" aria-labelledby={`${panelId}-title`}>
      <div className="panel-heading">
        <h2 id={`${panelId}-title`}>Views and exports</h2>
        <button type="button" aria-expanded={open} aria-controls={`${panelId}-body`} onClick={() => setOpen((v) => !v)}>
          {open ? 'Close views' : 'Open views'}
        </button>
      </div>

      {open && (
        <div id={`${panelId}-body`} className="panel-block">
          <p className="hint">
            A view is a chosen set of items for one audience. Only what you pick is exported, and anything sensitive or restricted needs its own choice.
            An export is a copy you can send. It is not encrypted, and the file leaves this app only when you download it.
          </p>

          {profile.views.length === 0 ? <p className="hint">No views yet.</p> : (
            <ul className="module-list">
              {profile.views.map((view) => {
                const evaluation = evaluateView(profile, view);
                const isOpen = openViewId === view.id;
                return (
                  <li key={view.id} className="module" aria-label={view.name}>
                    <h3>{view.name}</h3>
                    <p className="hint">
                      For {audienceName(view)}. {plural(evaluation.counts.included, 'item', 'items')} included, {plural(evaluation.counts.held, 'item', 'items')} held back.
                      {!evaluation.buildable && ' Needs attention before it can be exported.'}
                    </p>
                    <div className="panel-actions">
                      <button type="button" aria-expanded={isOpen} onClick={() => setOpenViewId(isOpen ? null : view.id)}>
                        {isOpen ? 'Close' : 'Build and export'}{' '}<span className="visually-hidden">{view.name}</span>
                      </button>
                      <button type="button" className="danger-text" onClick={() => setDoomed(view)}>Delete{' '}<span className="visually-hidden">{view.name}</span></button>
                    </div>
                    {isOpen && <ViewBuilder profile={profile} view={view} run={run} announce={announce} now={now} saveFile={saveFile} saveBlob={saveBlob} makePng={makePng} pageUrl={pageUrl} copyText={copyText} />}
                  </li>
                );
              })}
            </ul>
          )}

          <h3>Make a view</h3>
          <form className="panel-block" onSubmit={create}>
            <label htmlFor={`${panelId}-name`}>Name of the view</label>
            <input id={`${panelId}-name`} type="text" value={name} maxLength={LIMITS.categoryNameLength} onChange={(e) => setName(e.target.value)} />
            <label htmlFor={`${panelId}-audience`}>Who it is for</label>
            <AudienceSelect id={`${panelId}-audience`} profile={profile} value={audienceId} onChange={setAudienceId} />
            <div className="panel-actions"><button type="submit" disabled={name.trim() === ''}>Make view</button></div>
          </form>
        </div>
      )}

      {doomed && (
        <ConfirmDialog
          title={`Delete the view ${doomed.name}?`}
          description="This removes the view only. Your items, answers, notes and audiences are not changed, and files you already downloaded stay where they are. You can undo this until you close or reload the page."
          confirmLabel="Delete view"
          onConfirm={confirmDelete}
          onCancel={() => setDoomed(null)}
        />
      )}
    </section>
  );
}
