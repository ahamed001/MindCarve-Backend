import { buildQuestions, itemIds } from './helpers.js';

// Source: "Brief Emotional Intelligence Scale (BEIS-10)" PDF.
const options = [
  { label: 'Strongly disagree', value: '1', score: 1 },
  { label: 'Disagree', value: '2', score: 2 },
  { label: 'Neither disagree nor agree', value: '3', score: 3 },
  { label: 'Agree', value: '4', score: 4 },
  { label: 'Strongly agree', value: '5', score: 5 },
];

const texts = [
  'I know why my emotions change',
  'I easily recognise my emotions as I experience them',
  'I can tell how people are feeling by listening to the tone of their voice',
  'By looking at their facial expressions, I recognise the emotions people are experiencing',
  'I seek out activities that make me happy',
  'I have control over my emotions',
  'I arrange events others enjoy',
  'I help other people feel better when they are down',
  'When I am in a positive mood, I am able to come up with new ideas',
  'I use good moods to help myself keep trying in the face of obstacles',
];

export const beis10 = {
  assessment: {
    code: 'BEIS-10',
    category: 'Emotional Intelligence',
    displayOrder: 1,
    name: 'Brief Emotional Intelligence Scale (BEIS-10)',
    description: '10-item self-report measure of emotional intelligence with five two-item subscales.',
    instructions: 'Select the response that best matches each of the following statements.',
    respondent: 'Self',
    sourceReference:
      'Davies, K. A., Lane, A. M., Devonport, T. J., & Scott, J. A. (2010). Validity and reliability of a Brief Emotional Intelligence Scale (BEIS-10). Journal of Individual Differences, 31(4), 198–208. https://doi.org/10.1027/1614-0001/a000028',
    primaryQuestionType: 'rating_scale',
    sections: [],
    scoring: {
      enabled: true,
      status: 'configured',
      reverseConstant: null,
      total: { enabled: true, method: 'sum', label: 'Total BEIS-10 Score (sum of all 10 items)', bands: [] },
      subscales: [
        { key: 'appraisal_own', name: 'Appraisal of Own Emotions', method: 'sum', itemIds: itemIds(1, 2) },
        { key: 'appraisal_others', name: 'Appraisal of Others’ Emotions', method: 'sum', itemIds: itemIds(3, 4) },
        { key: 'regulation_own', name: 'Regulation of Own Emotions', method: 'sum', itemIds: itemIds(5, 6) },
        { key: 'regulation_others', name: 'Regulation of Others’ Emotions', method: 'sum', itemIds: itemIds(7, 8) },
        { key: 'utilisation', name: 'Utilisation of Emotions', method: 'sum', itemIds: itemIds(9, 10) },
      ],
      outputs: [],
      interpretationNote: 'Raw subscale and total scores only. Community percentile norms were not supplied, so no descriptors are applied.',
    },
    sourceNotes: [
      'A sample BEIS-10 report shows community percentiles and descriptors (e.g. raw 38 → 51st percentile, "Average"), but the norm table itself was not supplied.',
    ],
    discrepancies: [],
  },
  questions: buildQuestions(texts.map((text) => ({ text })), { type: 'rating_scale', options }),
};
