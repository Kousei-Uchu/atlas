// Search box and category filter for the chart (M2-05). Controlled: the chart owns the values.
// The result summary is a polite status, so a screen reader hears how many items match
// without the page moving or focus leaving the box.
import { useId } from 'react';
import { LIMITS } from '../../domain/limits.js';

/**
 * @param {{
 *   query: string,
 *   categoryId: string,
 *   choices: { id: string, name: string, depth: number }[],
 *   summary: string,
 *   active: boolean,
 *   onQuery: (value: string) => void,
 *   onCategory: (id: string) => void,
 *   onClear: () => void,
 * }} props
 */
export function SearchBar({ query, categoryId, choices, summary, active, onQuery, onCategory, onClear }) {
  const searchId = useId();
  const categoryFieldId = useId();
  return (
    <div className="search-bar" role="search" aria-label="Find items in the chart">
      <div className="search-fields">
        <div className="field">
          <label htmlFor={searchId}>Search items</label>
          <input
            id={searchId}
            type="search"
            value={query}
            maxLength={LIMITS.labelLength}
            autoComplete="off"
            onChange={(event) => onQuery(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={categoryFieldId}>Show category</label>
          <select id={categoryFieldId} value={categoryId} onChange={(event) => onCategory(event.target.value)}>
            <option value="">All categories</option>
            {choices.map((choice) => (
              <option key={choice.id} value={choice.id}>{`${'– '.repeat(choice.depth)}${choice.name}`}</option>
            ))}
          </select>
        </div>
        <button type="button" onClick={onClear} disabled={!active}>Clear filters</button>
      </div>
      <p className="hint search-summary" role="status">{summary}</p>
    </div>
  );
}
