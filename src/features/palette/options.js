// Plain-language labels for the palette editor's choices (spec 5.2).
// The stored values are the schema enums; these only affect what the person reads.
export const ICON_OPTIONS = [
  ['check', 'Tick'], ['cross', 'Cross'], ['question', 'Question mark'], ['tilde', 'Wavy line'],
  ['dash', 'Dash'], ['circle', 'Circle'], ['dot', 'Dot'], ['star', 'Star'], ['heart', 'Heart'], ['pause', 'Pause'],
];

export const PATTERN_OPTIONS = [
  ['solid', 'Solid border'], ['stripes', 'Stripes (double border)'], ['dots', 'Dots (dotted border)'], ['dashed', 'Dashed border'],
];

export const SEMANTIC_OPTIONS = [
  ['positive', 'Comfortable (a yes)'],
  ['conditional', 'Depends on the situation'],
  ['uncertain', 'Not sure'],
  ['negative', 'Not comfortable (a no)'],
  ['neutral', 'No answer or neutral'],
  ['not-applicable', 'Does not apply'],
];
