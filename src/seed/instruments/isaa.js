import { buildQuestions, range } from './helpers.js';

// Source: ISAA Test Manual pages 14–15 and "Percentage of Disability as per the score" table (reference photos).
const options = [
  { label: 'Rarely', description: 'Upto 20%', value: '1', score: 1 },
  { label: 'Sometimes', description: '21 – 40%', value: '2', score: 2 },
  { label: 'Frequently', description: '41 – 60%', value: '3', score: 3 },
  { label: 'Mostly', description: '61 – 80%', value: '4', score: 4 },
  { label: 'Always', description: '81 – 100%', value: '5', score: 5 },
];

const sections = [
  { key: 'social', name: 'I. Social Relationship and Reciprocity', order: 1 },
  { key: 'emotional', name: 'II. Emotional Responsiveness', order: 2 },
  { key: 'speech', name: 'III. Speech-Language and Communication', order: 3 },
  { key: 'behaviour', name: 'IV. Behaviour Patterns', order: 4 },
  { key: 'sensory', name: 'V. Sensory Aspects', order: 5 },
  { key: 'cognitive', name: 'VI. Cognitive Component', order: 6 },
];

const sectionFor = (n) => {
  if (n <= 9) return 'social';
  if (n <= 14) return 'emotional';
  if (n <= 23) return 'speech';
  if (n <= 30) return 'behaviour';
  if (n <= 36) return 'sensory';
  return 'cognitive';
};

const texts = [
  'Has poor eye contact',
  'Lacks social smile',
  'Remains aloof',
  'Does not reach out to others',
  'Unable to relate to people',
  'Unable to respond to social/ environmental cues',
  'Engages in solitary and repetitive play activities',
  'Unable to take turns in social interaction',
  'Does not maintain peer relationships',
  'Shows inappropriate emotional response',
  'Shows exaggerated emotions',
  'Engages in self-stimulating emotions',
  'Lacks fear of danger',
  'Excited or agitated for no apparent reason',
  'Acquired speech and lost it',
  'Has difficulty in using non-verbal language or gestures to communicate',
  'Engages in stereotyped and repetitive use of language',
  'Engages in echolalic speech',
  'Produces infantile squeals/ unusual noises',
  'Unable to initiate or sustain conversation with others',
  'Uses jargon or meaningless words',
  'Uses pronoun reversals',
  'Unable to grasp pragmatics of communication (real meaning)',
  'Engages in stereotyped and repetitive motor mannerisms',
  'Shows attachment to inanimate objects',
  'Shows hyperactivity/ restlessness',
  'Exhibits aggressive behavior',
  'Throws temper tantrums',
  'Engages in self-injurious behavior',
  'Insists on sameness',
  'Unusually sensitive to sensory stimuli',
  'Stares into space for long periods of time',
  'Has difficulty in tracking objects',
  'Has unusual vision',
  'Insensitive to pain',
  'Responds to objects/people unusually by smelling, touching or tasting',
  'Inconsistent attention and concentration',
  'Shows delay in responding',
  'Has unusual memory of some kind',
  'Has ‘savant’ ability',
];

export const isaa = {
  assessment: {
    code: 'ISAA',
    category: 'Autism (Child)',
    displayOrder: 4,
    name: 'Indian Scale for Assessment of Autism (ISAA)',
    description:
      '40-item rating scale divided into six domains, rated on a five-point frequency scale by observing the child and interviewing the parents.',
    instructions:
      'Below are given 40 statements which are divided under six domains, please tick (√) mark the appropriate rating for each item of the scale by observing the child and by interviewing the parents in order to assess Autism',
    respondent: 'Examiner (observation of the child and parent interview)',
    sourceReference:
      'National Institute for the Mentally Handicapped (Ministry of Social Justice & Empowerment, Govt. of India), Secunderabad — ISAA Test Manual.',
    primaryQuestionType: 'frequency_scale',
    sections,
    scoring: {
      enabled: true,
      status: 'configured',
      reverseConstant: null,
      subscaleLabel: 'Domains',
      total: {
        enabled: true,
        method: 'sum',
        label: 'Total score',
        bands: [
          { min: null, max: 69, label: 'No Autism', riskLevel: 'low', description: 'Source classification: < 70' },
          { min: 70, max: 106, label: 'Mild Autism', riskLevel: 'moderate', description: 'Source classification: 70 to 106' },
          { min: 107, max: 153, label: 'Moderate Autism', riskLevel: 'high', description: 'Source classification: 107 to 153' },
          { min: 154, max: null, label: 'Severe Autism', riskLevel: 'high', description: 'Source classification: > 153' },
        ],
      },
      subscales: sections.map((s) => ({
        key: s.key,
        name: s.name.replace(/^[IVX]+\.\s*/, ''),
        method: 'sum',
        itemIds: range(1, 40).filter((id) => sectionFor(Number(id)) === s.key),
        description: 'Domain raw sum (the source defines domain membership; no domain-level cutoffs are supplied).',
      })),
      outputs: [
        {
          key: 'disability_percentage',
          name: 'Percentage of Disability as per the score',
          source: 'total',
          note: 'Transcribed from the source table. Scores below 70 are not listed in the source table.',
          bands: [
            { min: 70, max: 70, label: '40%', value: 40 },
            { min: 71, max: 88, label: '50%', value: 50 },
            { min: 89, max: 105, label: '60%', value: 60 },
            { min: 106, max: 123, label: '70%', value: 70 },
            { min: 124, max: 140, label: '80%', value: 80 },
            { min: 141, max: 158, label: '90%', value: 90 },
            { min: 159, max: null, label: '100%', value: 100, description: 'Source: Above 158' },
          ],
        },
      ],
      interpretationNote:
        'Classification and disability percentage are reproduced from the ISAA Test Manual tables. Assessment output only — not an independent diagnosis.',
    },
    sourceNotes: [
      'Risk levels attached to classification bands (No Autism → low, Mild → moderate, Moderate/Severe → high) are platform DEFAULTS for dashboard grouping and require clinician confirmation.',
      'Item 29 ("Engages in self-injurious behavior") is marked as sensitive so clinicians see it highlighted. No automatic review trigger is configured.',
      'The manual page header reads "Indian Scale for Assessment of Autism"; its conclusion reads "Indian Scale for Identification of Autism (ISAA)".',
    ],
    discrepancies: [
      'Classification bands and the disability-percentage table use different boundaries: classification Mild = 70–106 / Moderate = 107–153 / Severe = > 153, while the percentage rows are 70, 71–88, 89–105, 106–123, 124–140, 141–158, Above 158. E.g. 106 is "Mild Autism" but shares the 70% row with 107–123 ("Moderate"); 154–158 are "Severe Autism" but map to 90%. Both tables are preserved unchanged — please confirm with the assessment administrator.',
      'The percentage table has no row for scores below 70.',
    ],
  },
  questions: buildQuestions(
    texts.map((text, i) => ({ text, sectionKey: sectionFor(i + 1), sensitive: i + 1 === 29 })),
    { type: 'frequency_scale', options },
  ),
};
