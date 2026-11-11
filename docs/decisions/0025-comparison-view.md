# 0025. Comparison view between two charts on this device

Date: 2026-11-11. Status: proposed (the owner may veto). Records D-065.

**What it is.** The spec lists "comparison view" with no detail beyond section 13, so this is a proposal. M4-07 already compares an audience with a person's own answers, and M7-03 already compares a snapshot with now. This adds the missing one: the open chart beside another chart stored on the same device (for example one made from a snapshot, or an imported one, which I-12 always makes a new profile). It lists the questions where the two answers differ, each side written as it is in its own chart.

**What it must never do.** Comparing two people's charts is where a tool is most tempted to say "you are compatible". So there is no match percentage, no total, no verdict and no suggested outcome (I-10). The result keys are checked in tests for that wording. Own words and notes are never read; only answers to state questions.

**Contract.**
- Data: `compareProfiles(mine, theirs)` in `domain/profile-compare.js`, pure. Questions line up by module and key (`origin`). Unanswered is the absence of an answer (I-01): Unanswered against an answer is a difference, two Unanswered is nothing. States are compared by their label text, because two charts may have different palettes.
- Hidden groups are left out of both sides. Answered questions only one chart has are counted, not guessed at. Questions a person added themselves have no origin, so they are counted as not compared.
- Reading: the other chart is read through `readProfile`, which uses the normal validating loader. Reading never writes (I-14) and neither chart is changed (I-05).
- Interaction: a native select picks the other chart; the result is a real table with column and row headers, so the table is its own text alternative. States show text beside icon and pattern (I-09). Keyboard and touch need nothing beyond the select.
- Empty and invalid states: with no second chart the panel says one is needed; a chart that cannot be read says so and is not compared; no differences says so.
- Export: nothing new. The comparison is not exported or shared; it is a view on this device.

**Not done.** Comparing against a share link or file without importing it first. Importing already makes a new profile (I-12), so that path works today in two steps; a one-step version is a later decision.
