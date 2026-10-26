// The bundled template catalogue (spec 12.2). Loaded with the app: no network fetch.
// A template that fails validation is left out and listed in CATALOGUE_PROBLEMS, so one bad
// data file can never stop the app starting. The tests require that list to be empty.
import { buildCatalogue } from '../../domain/templates.js';
import starter from './starter.js';
import namesPronouns from './names-pronouns.js';
import genderedLanguage from './gendered-language.js';
import physicalContact from './physical-contact.js';
import personalSpace from './personal-space.js';
import communication from './communication.js';
import emotionalSupport from './emotional-support.js';
import sensoryProfile from './sensory-profile.js';
import accessibilityNeeds from './accessibility-needs.js';
import privacyDigital from './privacy-digital.js';
import schoolWork from './school-work.js';
import everydayPractical from './everyday-practical.js';
import conflictRepair from './conflict-repair.js';
import instructionSheet from './instruction-sheet.js';
import overwhelmPlan from './overwhelm-plan.js';
import relationshipAffection from './relationship-affection.js';
import intimacyBoundaries from './intimacy-boundaries.js';
import attraction from './attraction.js';
import anatomyCompatibility from './anatomy-compatibility.js';
import genderExpression from './gender-expression.js';
import bodyComfort from './body-comfort.js';
import emergencyCard from './emergency-card.js';

const RAW_TEMPLATES = [
  starter, namesPronouns, genderedLanguage, physicalContact, personalSpace, communication, emotionalSupport,
  sensoryProfile, accessibilityNeeds, privacyDigital, schoolWork, everydayPractical, conflictRepair, instructionSheet, overwhelmPlan,
  relationshipAffection, intimacyBoundaries, attraction, anatomyCompatibility, genderExpression, bodyComfort, emergencyCard,
];

const { templates, problems } = buildCatalogue(RAW_TEMPLATES);

export const TEMPLATES = Object.freeze(templates);
export const CATALOGUE_PROBLEMS = Object.freeze(problems);

export function listTemplates() {
  return TEMPLATES;
}

/** @param {string} templateId */
export function getTemplate(templateId) {
  return TEMPLATES.find((t) => t.templateId === templateId) ?? null;
}
