// The click cycle (spec 6). Pure: depends only on state IDs, never on colour or label.
import { UNANSWERED_ID } from './defaults.js';

/**
 * States that take part in the cycle, in order.
 * @param {import('./schema.js').State[]} states
 */
export function getCycle(states) {
  return states
    .filter((s) => s.cycleOrder !== null && s.cycleOrder !== undefined)
    .sort((a, b) => a.cycleOrder - b.cycleOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Map a click kind to a cycle direction through the profile setting (D-003).
 * @param {'primary'|'secondary'} kind
 * @param {'negative'|'positive'} primaryDirection
 */
export function directionForAction(kind, primaryDirection) {
  const opposite = primaryDirection === 'negative' ? 'positive' : 'negative';
  return kind === 'primary' ? primaryDirection : opposite;
}

/**
 * Next state along the configured cycle.
 *
 * - A missing current state is treated as Unanswered, never as a positive state (I-01).
 * - A known state outside the cycle (for example Not applicable) goes to Unanswered (D-007).
 * - At an end, `clamp` stays put and reports `clamped: true`; `loop` wraps.
 * - Invalid configuration returns `{ ok: false }`. It never throws and never guesses.
 *
 * @param {string|null|undefined} currentStateId
 * @param {import('./schema.js').State[]} states
 * @param {'negative'|'positive'} direction
 * @param {{ endBehaviour: 'clamp'|'loop' }} options
 * @returns {{ ok: true, stateId: string, clamped: boolean } | { ok: false, error: string }}
 */
export function getNextState(currentStateId, states, direction, { endBehaviour } = { endBehaviour: 'clamp' }) {
  if (!Array.isArray(states)) return fail('States must be a list.');
  if (direction !== 'negative' && direction !== 'positive') return fail('Direction must be negative or positive.');
  if (endBehaviour !== 'clamp' && endBehaviour !== 'loop') return fail('End behaviour must be clamp or loop.');

  const cycle = getCycle([...states]);
  const orders = cycle.map((s) => s.cycleOrder);
  if (new Set(orders).size !== orders.length) return fail('Two states share the same cycle position.');
  if (!cycle.some((s) => s.id === UNANSWERED_ID)) return fail('Unanswered must be part of the cycle.');

  const current = currentStateId ?? UNANSWERED_ID;
  const known = states.some((s) => s.id === current);
  if (!known) return fail(`Unknown state: ${current}`);

  const index = cycle.findIndex((s) => s.id === current);
  if (index === -1) return { ok: true, stateId: UNANSWERED_ID, clamped: false };

  const step = direction === 'positive' ? 1 : -1;
  const target = index + step;
  if (target >= 0 && target < cycle.length) return { ok: true, stateId: cycle[target].id, clamped: false };

  if (endBehaviour === 'loop') {
    const wrapped = (target + cycle.length) % cycle.length;
    return { ok: true, stateId: cycle[wrapped].id, clamped: false };
  }
  return { ok: true, stateId: current, clamped: true };
}

function fail(error) {
  return { ok: false, error };
}
