// Comparison view (M7-05, D-065). Puts the open chart next to another chart saved on this device and lists
// where the answers differ. It reads the other chart and changes nothing: neither chart is edited, and
// nothing is scored or summed up into a verdict (I-10). The result is a real table, so it is its own text
// alternative, and the state is always written as text next to its colour, icon and pattern (I-09).
import { useEffect, useId, useMemo, useState } from 'react';
import { StateBadge } from '../../components/StateBadge.jsx';
import { compareProfiles } from '../../domain/profile-compare.js';

const MAX_ROWS = 200;
const count = (n, one, many) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

/** @param {{ profile: object, profiles: Array<{id: string, title: string, valid: boolean}>, readProfile: Function }} props */
export function ComparePanel({ profile, profiles, readProfile }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [otherId, setOtherId] = useState('');
  const [other, setOther] = useState({ status: 'idle' });

  const choices = profiles.filter((p) => p.valid && p.id !== profile.id);

  useEffect(() => {
    if (!open || !otherId) { setOther({ status: 'idle' }); return undefined; }
    let current = true;
    setOther({ status: 'loading' });
    readProfile(otherId)
      .then((result) => { if (current) setOther(result.ok ? { status: 'ready', profile: result.profile } : { status: 'failed' }); })
      .catch(() => { if (current) setOther({ status: 'failed' }); });
    return () => { current = false; };
  }, [open, otherId, readProfile]);

  const result = useMemo(() => (other.status === 'ready' ? compareProfiles(profile, other.profile) : null), [profile, other]);

  return (
    <section className="panel" aria-labelledby={`${panelId}-title`}>
      <div className="panel-heading">
        <h2 id={`${panelId}-title`}>Compare charts</h2>
        <button type="button" aria-expanded={open} aria-controls={`${panelId}-body`} onClick={() => setOpen((v) => !v)}>
          {open ? 'Close comparison' : 'Open comparison'}
        </button>
      </div>
      {open && (
        <div id={`${panelId}-body`} className="panel-block">
          {choices.length === 0 ? (
            <p className="hint">
              To compare, this device needs a second chart. Make a new profile, or import one, and it will appear here.
            </p>
          ) : (
            <>
              <p className="hint">
                This lists the questions where the two charts have different answers. It changes neither chart, it adds
                nothing up, and it does not say whether the charts fit together. Own words and notes are not read.
              </p>
              <label className="field">
                <span>Compare with</span>
                <select value={otherId} onChange={(event) => setOtherId(event.target.value)}>
                  <option value="">Choose a chart</option>
                  {choices.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </label>
              {other.status === 'loading' && <p className="hint" role="status">Reading that chart.</p>}
              {other.status === 'failed' && <p className="hint" role="status">That chart could not be read, so it was not compared.</p>}
              {result && (
                <>
                  <p role="status">
                    {result.differences.length === 0
                      ? 'No differences in the questions both charts have.'
                      : `${count(result.differences.length, 'question has', 'questions have')} a different answer.`}{' '}
                    {count(result.same, 'question has', 'questions have')} the same answer in both.
                  </p>
                  {result.differences.length > 0 && (
                    <div className="table-scroll">
                      <table className="cmp-table">
                        <caption>Questions with different answers</caption>
                        <thead>
                          <tr>
                            <th scope="col">Question</th>
                            <th scope="col">{profile.title}</th>
                            <th scope="col">{other.profile.title}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.differences.slice(0, MAX_ROWS).map((row) => (
                            <tr key={row.key}>
                              <th scope="row">{row.label}<span className="hint"> in {row.categoryName}</span></th>
                              <td><StateBadge state={row.mine} /></td>
                              <td><StateBadge state={row.theirs} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {result.differences.length > MAX_ROWS && <p className="hint">And {result.differences.length - MAX_ROWS} more.</p>}
                  {(result.onlyInMine > 0 || result.onlyInTheirs > 0 || result.notComparable > 0) && (
                    <ul className="hint">
                      {result.onlyInMine > 0 && <li>{count(result.onlyInMine, 'answered question is', 'answered questions are')} only in {profile.title}.</li>}
                      {result.onlyInTheirs > 0 && <li>{count(result.onlyInTheirs, 'answered question is', 'answered questions are')} only in {other.profile.title}.</li>}
                      {result.notComparable > 0 && <li>{count(result.notComparable, 'question you added yourself was', 'questions you added yourself were')} not compared, because there is nothing to line them up by.</li>}
                    </ul>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
