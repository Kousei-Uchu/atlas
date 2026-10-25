// Shows the contrast between a state's background and its text colour (M2-03).
//
// It is advice, not a rule: the save button stays enabled and nothing is changed for the
// person (I-03). The text is a plain paragraph rather than a live region, because the ratio
// changes on every keystroke or colour-picker drag and announcing each one would be noise.
// Fields point at it with aria-describedby so a screen reader reads it when they are focused.
import { assessStateContrast, contrastWarningText } from '../../domain/contrast.js';

/**
 * @param {{ id: string, background: string, foreground: string }} props
 */
export function ContrastNote({ id, background, foreground }) {
  const assessment = assessStateContrast(background, foreground);

  // While a typed hex code is incomplete there is nothing to judge yet.
  if (!assessment) {
    return <p className="contrast-note hint" id={id} data-level="pending">Contrast is checked once both colours are complete hex codes.</p>;
  }

  const warning = contrastWarningText(assessment);
  if (warning) {
    return <p className="contrast-note" id={id} data-level={assessment.level}>{warning}</p>;
  }
  return (
    <p className="contrast-note hint" id={id} data-level={assessment.level}>
      Contrast {assessment.shown.toFixed(1)} to 1. Easy to read.
    </p>
  );
}
