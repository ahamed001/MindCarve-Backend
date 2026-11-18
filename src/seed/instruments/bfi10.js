import { buildQuestions, itemIds } from './helpers.js';

// Source: "A Brief Version of the Big Five Personality Inventory" (BFI-10) form, scoring instructions and benchmarks (reference photos).
const options = [
  { label: 'Disagree strongly', value: '1', score: 1 },
  { label: 'Disagree a little', value: '2', score: 2 },
  { label: 'Neither agree nor disagree', value: '3', score: 3 },
  { label: 'Agree a little', value: '4', score: 4 },
  { label: 'Agree strongly', value: '5', score: 5 },
];

const STEM = 'I see myself as someone who ...';
const items = [
  ['... is reserved', true],
  ['... is generally trusting', false],
  ['... tends to be lazy', true],
  ['... is relaxed, handles stress well', true],
  ['... has few artistic interests', true],
  ['... is outgoing, sociable', false],
  ['... tends to find fault with others', true],
  ['... does a thorough job', false],
  ['... gets nervous easily', false],
  ['... has an active imagination', false],
];

// Source benchmark table, "If using Total Sum (2–10)" column.
const sumBands = [
  { min: 9, max: 10, label: 'Very High', description: 'The trait is highly dominant in your personality.' },
  { min: 7, max: 8, label: 'High', description: 'You lean heavily toward this trait.' },
  { min: 5, max: 6, label: 'Average', description: 'You are balanced; neither high nor low.' },
  { min: 3, max: 4, label: 'Low', description: 'You place below average for this trait.' },
  { min: 2, max: 2, label: 'Very Low', description: 'The trait is distinctly absent or its opposite is dominant.' },
];

const trait = (key, name, ids) => ({ key, name, method: 'sum', itemIds: ids, bands: sumBands });

export const bfi10 = {
  assessment: {
    code: 'BFI-10',
    category: 'Personality',
    displayOrder: 6,
    name: 'Big Five Inventory-10 (BFI-10)',
    description: '10-item short version of the Big Five Inventory producing a dimensional profile across five personality traits.',
    instructions: 'How well do the following statements describe your personality?',
    respondent: 'Self',
    sourceReference:
      'Adapted from Rammstedt, B. & John, O. P. (2007). Measuring personality in one minute or less: A 10 item short version of the Big Five Inventory in English and German. Journal of Research in Personality, 41, 203-212.',
    primaryQuestionType: 'rating_scale',
    sections: [],
    scoring: {
      enabled: true,
      status: 'configured',
      reverseConstant: 6, // Source: Reversed Score = 6 - Original Score
      subscaleLabel: 'Traits',
      total: { enabled: false, method: 'sum', label: 'Total', bands: [] },
      subscales: [
        trait('extraversion', 'Extraversion', itemIds(1, 6)),
        trait('agreeableness', 'Agreeableness', itemIds(2, 7)),
        trait('conscientiousness', 'Conscientiousness', itemIds(3, 8)),
        trait('neuroticism', 'Neuroticism', itemIds(4, 9)),
        trait('openness', 'Openness to Experience', itemIds(5, 10)),
      ],
      outputs: [],
      interpretationNote:
        'Like the full-length BFI, the BFI-10 does not have clinical cut-off scores or a "pass/fail" metric. Instead, it creates a dimensional profile. This is not a clinical diagnosis.',
    },
    sourceNotes: [
      'Trait scores use the Sum (2–10) option from the source with its benchmarks: 9–10 Very High, 7–8 High, 5–6 Average, 3–4 Low, 2 Very Low. (The source also allows a Mean 1–5 with equivalent benchmarks.)',
      'No risk levels are configured — personality scores are not clinical risk indicators.',
    ],
    discrepancies: [],
  },
  questions: buildQuestions(
    items.map(([text, reverse]) => ({ text, helpText: STEM, reverseScored: reverse })),
    { type: 'rating_scale', options },
  ),
};
