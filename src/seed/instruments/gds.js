import { buildQuestions } from './helpers.js';

// Source: "Geriatric Depression Scale (Short Form)" (Sheikh & Yesavage, 1986) reference photo.
// The answer indicating depression (bold + italic in the source) scores 1 point.
const items = [
  ['Are you basically satisfied with your life?', 'no'],
  ['Have you dropped many of your activities and interests?', 'yes'],
  ['Do you feel that your life is empty?', 'yes'],
  ['Do you often get bored?', 'yes'],
  ['Are you in good spirits most of the time?', 'no'],
  ['Are you afraid that something bad is going to happen to you?', 'yes'],
  ['Do you feel happy most of the time?', 'no'],
  ['Do you often feel helpless?', 'yes'],
  ['Do you prefer to stay at home, rather than going out and doing new things?', 'yes'],
  ['Do you feel you have more problems with memory than most people?', 'yes'],
  ['Do you think it is wonderful to be alive?', 'no'],
  ['Do you feel pretty worthless the way you are now?', 'yes'],
  ['Do you feel full of energy?', 'no'],
  ['Do you feel that your situation is hopeless?', 'yes'],
  ['Do you think that most people are better off than you are?', 'yes'],
];

export const gds = {
  assessment: {
    code: 'GDS-15',
    category: 'Depression (Geriatric)',
    displayOrder: 5,
    name: 'Geriatric Depression Scale – Short Form (GDS)',
    description: '15 yes/no questions about how the respondent felt over the past week.',
    instructions: 'Choose the best answer for how you felt over the past week.',
    respondent: 'Self',
    timeframe: 'The past week',
    sourceReference:
      'Sheikh JI, Yesavage JA. Geriatric Depression Scale (GDS): recent evidence and development of a shorter version. Clin Gerontol. 1986 June;5(1/2):165-173.',
    primaryQuestionType: 'yes_no',
    sections: [],
    scoring: {
      enabled: true,
      status: 'configured',
      reverseConstant: null,
      total: {
        enabled: true,
        method: 'sum',
        label: 'Total score',
        bands: [
          { min: 0, max: 5, label: 'Normal', riskLevel: 'low', description: 'Source: a score of 0 to 5 is normal.' },
          { min: 6, max: null, label: 'Suggests depression', riskLevel: 'high', description: 'Source: a score greater than 5 suggests depression.' },
        ],
      },
      subscales: [],
      outputs: [],
      interpretationNote: 'Answers indicating depression score one point each. Screening output only — not an independent diagnosis.',
    },
    sourceNotes: [
      'Scoring answers transcribed from the bold/italic answers in the source form.',
      'The source instructions also say: "Note: when asking the patient to complete the form, provide the self-rated form (included on the following page)." The self-rated page was not supplied; the clinician form wording is used.',
      'Risk levels (> 5 → high) are platform DEFAULTS for dashboard grouping and require clinician confirmation.',
    ],
    discrepancies: [],
  },
  questions: buildQuestions(
    items.map(([text, depressive]) => ({
      text,
      options: [
        { label: 'Yes', value: 'yes', score: depressive === 'yes' ? 1 : 0 },
        { label: 'No', value: 'no', score: depressive === 'no' ? 1 : 0 },
      ],
    })),
    { type: 'yes_no' },
  ),
};
