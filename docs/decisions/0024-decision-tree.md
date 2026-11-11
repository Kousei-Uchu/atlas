# 0024. Decision tree over the Overwhelm or support plan

Date: 2026-11-10. Status: proposed (the owner may veto). Records D-064.

**What it is.** The spec lists "decision tree" with no detail beyond the section 13 requirements, so this is a proposal: a read-only branching outline of the Overwhelm or support plan. The root is "When it is getting too much". Each branch is one group of the plan, in the plan's own order (early signs, what helps, what others can do, afterwards). Each leaf is something the person already wrote or chose: text they typed, and the items they answered, grouped under the state they chose.

**What it must never do.** It has no data of its own and no schema change. It does not suggest, rank, score or advise (I-10), it is not clinical, and it does not decide anything for the person or for anyone reading it. Items left Unanswered, and text left blank, are not leaves: absence stays absence (I-01).

**Interaction contract.**
- Data contract: derived on read from the plan's categories (`origin.templateId = overwhelm-plan`, visible only) and the person's answers. Editing stays in the chart (I-05); the tree has no commands.
- Keyboard and touch: each branch is a native `details`/`summary`, so Enter and Space fold it and no drawing or pointer gesture is needed.
- Text alternative: the outline is a nested list, so the list is itself the text alternative. States show their text beside icon and pattern (I-09).
- Empty states: plan not on or hidden, the panel says which module to turn on. Plan on but empty, it says nothing has been written or chosen yet, and each empty branch says "Nothing here yet."
- Invalid states: a missing or dangling answer resolves to Unanswered and is not shown.
- Export: nothing new. The plan exports as items, exactly as before. The tree is a view and is not exported as a picture or a document.

**Tests.** Domain: null cases, order, leaves, blank text, no mutation. E2E (desktop and phone): turn-on hint, empty then filled outline, keyboard folding, axe in three themes, 320 px reflow.
