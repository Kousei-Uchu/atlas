// Module library (M3-04, M3-06): add a template to the profile, hide it, turn it on again, update it
// from a newer version, or reset it to the template.
// Only turns choices into domain commands through `run` (I-05). Adult-intended modules always
// show the note first (D-009), and the command refuses without it.
import { useId, useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { TEMPLATES } from '../../content/templates/index.js';
import { ADULT_MODULE_NOTICE } from '../../content/notices.js';
import { addModule, moduleStatus, setModuleVisibility } from '../../domain/module-commands.js';
import { planModuleSync, resetModule, updateModule } from '../../domain/module-sync.js';
import { summariseTemplate } from '../../domain/templates.js';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const SHOWN = 8; // how many names a confirmation lists before saying "and N more"

function Names({ names }) {
  if (names.length === 0) return null;
  return (
    <ul className="hint">
      {names.slice(0, SHOWN).map((name, index) => <li key={`${index}-${name}`}>{name}</li>)}
      {names.length > SHOWN && <li>and {names.length - SHOWN} more</li>}
    </ul>
  );
}

/** What the confirmation says an update will add. */
function addedNames(plan) {
  return [...plan.addCategories.map((c) => `${c.name} (new category, ${plural(c.items, 'item', 'items')})`), ...plan.addItems.map((i) => `${i.label} (in ${i.category})`)];
}

function UpdateDialog({ template, plan, onConfirm, onCancel }) {
  const items = plan.addItems.length + plan.addCategories.reduce((n, c) => n + c.items, 0);
  return (
    <ConfirmDialog
      title={`Update ${template.title}?`}
      description={`This adds ${plural(items, 'item', 'items')} from version ${plan.latestVersion} of this module to the profile. Your answers, notes and wording are not changed, and nothing is removed. If you deleted something that is still in the module, it comes back too.`}
      confirmLabel="Update module"
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <Names names={addedNames(plan)} />
    </ConfirmDialog>
  );
}

function ResetDialog({ template, plan, onConfirm, onCancel }) {
  const missing = plan.addItems.length + plan.addCategories.reduce((n, c) => n + c.items, 0);
  return (
    <ConfirmDialog
      title={`Reset ${template.title} to the template?`}
      description="This puts the module's wording and order back to the template's. Your answers and notes are kept. Things you added yourself stay, and so does anything the module no longer has. Items you deleted from the module come back. Privacy levels are never lowered."
      confirmLabel="Reset module"
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <p className="hint">
        {plural(plan.differing.length, 'entry uses', 'entries use')} wording that differs from the template.{' '}
        {missing === 0 ? 'Nothing is missing.' : `${plural(missing, 'item is', 'items are')} missing and will be added.`}
      </p>
      <Names names={plan.differing.map((d) => d.name)} />
    </ConfirmDialog>
  );
}

function Status({ status, summary }) {
  if (status.state === 'absent') return <span>Not added. {plural(summary.items, 'item', 'items')} in {plural(summary.categories, 'category', 'categories')}.</span>;
  if (status.state === 'on') return <span>On. {plural(status.items, 'item', 'items')} in {plural(status.categories, 'category', 'categories')}.</span>;
  return <span>Hidden. Your answers are kept.</span>;
}

/**
 * @param {{
 *   profile: object,
 *   run: (command: Function, args: object) => { ok: boolean },
 *   announce: (text: string) => void,
 *   templates?: object[],
 * }} props
 */
export function ModulesPanel({ profile, run, announce, templates = TEMPLATES }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(null); // { template, action } while the adult note is showing
  const [maintain, setMaintain] = useState(null); // { template, action: 'update'|'reset' } while that dialog is showing
  const library = templates.filter((t) => !t.isSample);

  const apply = (template, action, acknowledgeAdult = false) => {
    if (action === 'add') {
      const result = run(addModule, { template, visibility: 'visible', acknowledgeAdult });
      if (result.ok) announce(`Added ${template.title}`);
      return;
    }
    const visibility = action === 'hide' ? 'hidden' : 'visible';
    const result = run(setModuleVisibility, { template, visibility, acknowledgeAdult });
    if (result.ok) announce(action === 'hide' ? `Hid ${template.title}. Your answers are kept.` : `Turned on ${template.title}`);
  };

  const choose = (template, action) => {
    if (action !== 'hide' && template.adultIntended) setPending({ template, action });
    else apply(template, action);
  };

  const confirm = () => {
    const { template, action } = pending;
    setPending(null);
    apply(template, action, true);
  };

  const maintainNow = () => {
    const { template, action } = maintain;
    setMaintain(null);
    if (action === 'update') {
      const result = run(updateModule, { template });
      if (result.ok) announce(`Updated ${template.title}. ${plural(result.added.items, 'item', 'items')} added. Your answers are kept.`);
    } else {
      const result = run(resetModule, { template });
      if (result.ok) announce(`Reset ${template.title}. ${plural(result.restored, 'entry', 'entries')} restored and ${plural(result.added.items, 'item', 'items')} added. Your answers are kept.`);
    }
  };
  const maintainPlan = maintain ? planModuleSync(profile, maintain.template) : null;

  return (
    <section className="panel" aria-labelledby={`${panelId}-title`}>
      <div className="panel-heading">
        <h2 id={`${panelId}-title`}>Modules</h2>
        <button type="button" aria-expanded={open} aria-controls={`${panelId}-body`} onClick={() => setOpen((v) => !v)}>
          {open ? 'Close module library' : 'Open module library'}
        </button>
      </div>

      {open && (
        <div id={`${panelId}-body`} className="panel-block">
          <p className="hint">
            A module adds a set of categories and items to this profile. Adding one never fills in an answer, and hiding one keeps its answers.
          </p>
          <ul className="module-list">
            {library.map((template) => {
              const status = moduleStatus(profile, template.templateId);
              const summary = summariseTemplate(template);
              const plan = status.state === 'absent' ? null : planModuleSync(profile, template);
              const titleId = `${panelId}-${template.templateId}`;
              return (
                <li key={template.templateId} className="module" aria-labelledby={titleId}>
                  <h3 id={titleId}>{template.title}</h3>
                  <p>{template.summary}</p>
                  {template.adultIntended && <p className="hint">Intended for adults. Hidden until you turn it on.</p>}
                  <p className="hint"><Status status={status} summary={summary} /></p>
                  {plan?.updateAvailable && !plan.newerInProfile && (
                    <p className="hint">A newer version of this module is available (version {plan.installedVersion} to {plan.latestVersion}).</p>
                  )}
                  {plan?.newerInProfile && <p className="hint">This profile has a newer version of this module than this app knows.</p>}
                  <div className="palette-row-actions">
                    {status.state === 'absent' && (
                      <button type="button" onClick={() => choose(template, 'add')}>
                        Add{' '}<span className="visually-hidden">{template.title}</span>
                      </button>
                    )}
                    {status.state === 'on' && (
                      <button type="button" onClick={() => choose(template, 'hide')}>
                        Hide{' '}<span className="visually-hidden">{template.title}</span>
                      </button>
                    )}
                    {status.state === 'hidden' && (
                      <button type="button" onClick={() => choose(template, 'show')}>
                        Turn on{' '}<span className="visually-hidden">{template.title}</span>
                      </button>
                    )}
                    {plan && plan.updateAvailable && !plan.newerInProfile && (
                      <button type="button" onClick={() => setMaintain({ template, action: 'update' })}>
                        Update{' '}<span className="visually-hidden">{template.title}</span>
                      </button>
                    )}
                    {plan && !plan.newerInProfile && (
                      <button type="button" onClick={() => setMaintain({ template, action: 'reset' })}>
                        Reset{' '}<span className="visually-hidden">{template.title}</span>{' '}to template
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {maintain?.action === 'update' && <UpdateDialog template={maintain.template} plan={maintainPlan} onConfirm={maintainNow} onCancel={() => setMaintain(null)} />}
      {maintain?.action === 'reset' && <ResetDialog template={maintain.template} plan={maintainPlan} onConfirm={maintainNow} onCancel={() => setMaintain(null)} />}

      {pending && (
        <ConfirmDialog
          title={`Turn on ${pending.template.title}?`}
          description={ADULT_MODULE_NOTICE}
          confirmLabel="Turn on module"
          onConfirm={confirm}
          onCancel={() => setPending(null)}
        />
      )}
    </section>
  );
}
