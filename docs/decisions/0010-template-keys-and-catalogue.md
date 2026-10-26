# 0010. Template keys, inheritance and a catalogue that fails soft

Date: 2026-10-26. Status: proposed (the user may veto).

Templates will be reset or updated long after a person first applies them, and by then the person may have renamed anything. So every category and item made from a template records the template id, the template version and a `key`. The key is the template's own name for that entry and is the only thing reset and update match on. It is unique across the whole template, categories and items together, which keeps matching to one lookup. Once a template ships, its keys do not change. If wording needs to change, the label changes and the key stays.

An item with no sensitivity of its own takes its category's. That keeps template files short and means raising a whole category is one edit. An item can still be set higher than its category, which the physical contact template does for closer contact between friends.

Templates with restricted content must be marked adult-intended and hidden by default. This makes the rule in D-008 and D-009 a property of the data, so a new template cannot ship without it.

The catalogue is checked when the app loads, but a template that fails the check is left out and reported rather than stopping the app. The tests require the report to be empty, so a bad file is caught before release and can never stop a person from opening their chart.
