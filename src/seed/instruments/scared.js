import { buildQuestions, itemIds } from './helpers.js';

// Source: SCARED Parent Version pages 1–2 and "SCARED Rating Scale Scoring Aide" (reference photos).
const options = [
  { label: 'Not True or Hardly Ever True', value: '0', score: 0 },
  { label: 'Somewhat True or Sometimes True', value: '1', score: 1 },
  { label: 'Very True or Often True', value: '2', score: 2 },
];

const texts = [
  'When my child feels frightened, it is hard for him/her to breathe',
  'My child gets headaches when he/she is at school',
  'My child doesn’t like to be with people he/she doesn’t know well',
  'My child gets scared if he/she sleeps away from home',
  'My child worries about other people liking him/her',
  'When my child gets frightened, he/she feels like passing out',
  'My child is nervous',
  'My child follows me wherever I go',
  'People tell me that my child looks nervous',
  'My child feels nervous with people he/she doesn’t know well',
  'My child gets stomachaches at school',
  'When my child gets frightened, he/she feels like he/she is going crazy',
  'My child worries about sleeping alone',
  'My child worries about being as good as other kids',
  'When he/she gets frightened, he/she feels like things are not real',
  'My child has nightmares about something bad happening to his/her parents',
  'My child worries about going to school',
  'When my child gets frightened, his/her heart beats fast',
  'He/she gets shaky',
  'My child has nightmares about something bad happening to him/her',
  'My child worries about things working out for him/her',
  'When my child gets frightened, he/she sweats a lot',
  'My child is a worrier',
  'My child gets really frightened for no reason at all',
  'My child is afraid to be alone in the house',
  'It is hard for my child to talk with people he/she doesn’t know well',
  'When my child gets frightened, he/she feels like he/she is choking',
  'People tell me that my child worries too much',
  'My child doesn’t like to be away from his/her family',
  'My child is afraid of having anxiety (or panic) attacks',
  'My child worries that something bad might happen to his/her parents',
  'My child feels shy with people he/she doesn’t know well',
  'My child worries about what is going to happen in the future',
  'When my child gets frightened, he/she feels like throwing up',
  'My child worries about how well he/she does things',
  'My child is scared to go to school',
  'My child worries about things that have already happened',
  'When my child gets frightened, he/she feels dizzy',
  'My child feels nervous when he/she is with other children or adults and he/she has to do something while they watch him/her (for example: read aloud, speak, play a game, play a sport)',
  'My child feels nervous when he/she is going to parties, dances, or any place where there will be people that he/she doesn’t know well',
  'My child is shy',
];

const cutoff = (value, label) => ({ value, operator: 'gte', label });

export const scared = {
  assessment: {
    code: 'SCARED-P',
    category: 'Anxiety (Child/Parent)',
    displayOrder: 3,
    name: 'Screen for Child Anxiety Related Disorders (SCARED) — Parent Version',
    description: '41-item parent-report screen for childhood anxiety with five scored subscales and a total anxiety score.',
    instructions:
      'Below is a list of statements that describe how people feel. Read each statement carefully and decide if it is "Not True or Hardly Ever True" or "Somewhat True or Sometimes True" or "Very True or Often True" for your child. Then for each statement, fill in one circle that corresponds to the response that seems to describe your child for the last 3 months. Please respond to all statements as well as you can, even if some do not seem to concern your child.',
    respondent: 'Parent',
    timeframe: 'The last 3 months',
    sourceReference:
      'Developed by Boris Birmaher, MD, Suneeta Khetarpal, MD, Marlane Cully, MEd, David Brent, MD, and Sandra McKenzie, PhD. Western Psychiatric Institute and Clinic, University of Pgh. (10/95).',
    primaryQuestionType: 'single_choice',
    sections: [],
    scoring: {
      enabled: true,
      status: 'configured',
      reverseConstant: null,
      total: {
        enabled: true,
        method: 'sum',
        label: 'Total anxiety score',
        // Source: "Total anxiety ≥ 25". Operator is configurable ('gte' = score >= value).
        cutoff: { value: 25, operator: 'gte', label: 'Total anxiety (may indicate the presence of an Anxiety Disorder)' },
        bands: [
          { min: null, max: 24, label: 'Below total anxiety cutoff (< 25)', riskLevel: 'low' },
          { min: 25, max: 30, label: 'May indicate the presence of an Anxiety Disorder', riskLevel: 'high', description: 'Source: total score ≥ 25' },
          {
            min: 31,
            max: null,
            label: 'May indicate the presence of an Anxiety Disorder (scores higher than 30 are more specific)',
            riskLevel: 'high',
            description: 'Source: "Scores higher than 30 are more specific."',
          },
        ],
      },
      subscales: [
        {
          key: 'panic_somatic',
          name: 'Panic Disorder or Significant Somatic Symptoms',
          method: 'sum',
          itemIds: itemIds(1, 6, 9, 12, 15, 18, 19, 22, 24, 27, 30, 34, 38),
          cutoff: cutoff(7, 'May indicate Panic Disorder or Significant Somatic Symptoms'),
        },
        {
          key: 'generalized_anxiety',
          name: 'Generalized Anxiety Disorder',
          method: 'sum',
          itemIds: itemIds(5, 7, 14, 21, 23, 28, 33, 35, 37),
          cutoff: cutoff(9, 'May indicate Generalized Anxiety Disorder'),
        },
        {
          key: 'separation_anxiety',
          name: 'Separation Anxiety Disorder',
          method: 'sum',
          itemIds: itemIds(4, 8, 13, 16, 20, 25, 29, 31),
          cutoff: cutoff(5, 'May indicate Separation Anxiety Disorder'),
        },
        {
          key: 'social_anxiety',
          name: 'Social Anxiety Disorder',
          method: 'sum',
          itemIds: itemIds(3, 10, 26, 32, 39, 40, 41),
          cutoff: cutoff(8, 'May indicate Social Anxiety Disorder'),
        },
        {
          key: 'school_avoidance',
          name: 'Significant School Avoidance',
          method: 'sum',
          itemIds: itemIds(2, 11, 17, 36),
          cutoff: cutoff(3, 'May indicate Significant School Avoidance'),
        },
      ],
      outputs: [],
      interpretationNote: 'Screening output from the SCARED scoring aide — not an independent diagnosis.',
    },
    sourceNotes: [
      'Only the Parent Version items were supplied. The scoring aide states it is for use with Parent and Child Versions; child-version items are not seeded.',
      'Total-band risk levels (≥ 25 → high) are platform DEFAULTS for dashboard grouping and require clinician confirmation.',
    ],
    discrepancies: [
      'The scoring aide text says "A score of 7 for items …" (and similarly 9, 5, 8, 3) while the table row says "Cutoff = 7". The platform interprets subscale cutoffs as score ≥ cutoff, consistent with "Total anxiety ≥ 25". Please confirm.',
    ],
  },
  questions: buildQuestions(texts.map((text) => ({ text })), { type: 'single_choice', options }),
};
