# 0033 Audience inheritance (D-073, O-009)

## Decision
An audience can sit inside another (M7-06). When nothing is set directly for an item:

1. A direct enabled override for the audience wins, even if it is more open than the parent.
2. Otherwise the nearest ancestor that has an enabled override for that item is inherited, **only if it is no more open than your own answer**. A wider parent override is held back and the audience keeps your own answer. The explanation says so and how to override directly.
3. Otherwise your own answer, otherwise Unanswered.

Two disagreeing enabled overrides on the nearest parent inherit as Unanswered (never "yes"), and the explanation names the parent so it can be settled there. No "most permissive wins" rule exists. Loops or missing parents stop the walk.

## Why narrowing only
Placing someone inside a group must not quietly share more than you chose. A wider setting has to be a deliberate, direct choice for that audience.

## Leak and privacy review
Every consumer (views, exports, share, comparison) reads `resolveAll`/`resolveItem`, so inheritance flows through the same hold-back rules (restricted, sensitive, conflicts). Inherited values are never more open than the own answer, tested across all items. Views list "(inherited from a parent audience)" as text.

## Not built: conditional rules
Time windows, contexts and "if X then Y" need inputs the app deliberately does not hold and rules that become hard to audit. They stay open under O-009 and need their own design and threat note.

## Tests
`tests/domain/audience-inheritance.test.js`, `tests/e2e/audience-inheritance.spec.js`.
