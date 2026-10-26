// Start a new profile from chosen modules (M3-06). Creates a separate profile (I-12) that holds
// only the modules ticked here, with no sample items and no answers. A module for adults shows the
// note first (D-009), and the domain command refuses without it.
import { useId, useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { TEMPLATES } from '../../content/templates/index.js';
import { ADULT_MODULE_NOTICE } from '../../content/notices.js';
import { LIMITS } from '../../domain/limits.js';

/**
 * @param {{
 *   onCreate: (args: { title: string, templates: object[], acknowledgeAdult: boolean }) => Promise<boolean>,
 *   announce: (text: string) => void,
 *   templates?: object[],
 * }} props
 */
export function NewProfileFromModules({ onCreate, announce, templates = TEMPLATES }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [chosen, setChosen] = useState([]); // template ids, in the order they were ticked
  const [asking, setAsking] = useState(false);
  const library = templates.filter((t) => !t.isSample);
  const picked = chosen.map((id) => library.find((t) => t.templateId === id)).filter(Boolean);
  const ready = title.trim() !== '' && picked.length > 0;

  const toggle = (templateId) => setChosen((list) => (list.includes(templateId) ? list.filter((id) => id !== templateId) : [...list, templateId]));

  const create = async (acknowledgeAdult) => {
    setAsking(false);
    if (await onCreate({ title, templates: picked, acknowledgeAdult })) {
      setTitle('');
      setChosen([]);
      setOpen(false);
      announce('New profile created from your modules');
    }
  };

  const submit = (event) => {
    event.preventDefault();
    if (!ready) return;
    if (picked.some((t) => t.adultIntended)) setAsking(true);
    else create(false);
  };

  return (
    <section className="panel" aria-labelledby={`${panelId}-title`}>
      <div className="panel-heading">
        <h2 id={`${panelId}-title`}>Start from modules</h2>
        <button type="button" aria-expanded={open} aria-controls={`${panelId}-body`} onClick={() => setOpen((v) => !v)}>
          {open ? 'Close' : 'Open'}<span className="visually-hidden"> start from modules</span>
        </button>
      </div>

      {open && (
        <form id={`${panelId}-body`} className="panel-block" onSubmit={submit}>
          <p className="hint">
            Make a new profile that holds only the modules you choose, with no sample items. Nothing is answered for you, and your other profiles are not changed.
          </p>
          <fieldset>
            <legend>Modules to include</legend>
            <ul className="module-list">
              {library.map((template) => {
                const fieldId = `${panelId}-${template.templateId}`;
                return (
                  <li key={template.templateId} className="module">
                    <input id={fieldId} type="checkbox" checked={chosen.includes(template.templateId)} onChange={() => toggle(template.templateId)} />
                    <label htmlFor={fieldId}>
                      {template.title}
                      {template.adultIntended && <span className="hint"> (intended for adults)</span>}
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
          <div className="add-form">
            <label htmlFor={`${panelId}-name`}>Name of the new profile</label>
            <input id={`${panelId}-name`} type="text" value={title} maxLength={LIMITS.titleLength} onChange={(e) => setTitle(e.target.value)} />
            <button type="submit" disabled={!ready}>Create profile from modules</button>
          </div>
          <p className="hint" aria-live="polite">{picked.length === 0 ? 'No modules chosen yet.' : `${picked.length} ${picked.length === 1 ? 'module' : 'modules'} chosen.`}</p>
        </form>
      )}

      {asking && (
        <ConfirmDialog
          title="Create a profile with modules for adults?"
          description={ADULT_MODULE_NOTICE}
          confirmLabel="Create profile"
          onConfirm={() => create(true)}
          onCancel={() => setAsking(false)}
        />
      )}
    </section>
  );
}
