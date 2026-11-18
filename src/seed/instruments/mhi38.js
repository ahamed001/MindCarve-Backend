import { buildQuestions, itemIds, scaleOptions } from './helpers.js';

// Source: "Mental Health Inventory (MHI–38)" PDF and "Table 1: Item composition of the six MHI subscales" photo.
const TIME = ['All of the time', 'Most of the time', 'A good bit of the time', 'Some of the time', 'A little of the time', 'None of the time'];
const FREQ = ['Always', 'Very often', 'Fairly often', 'Sometimes', 'Almost never', 'Never'];

const items = [
  ['How happy, satisfied, or pleased have you been with your personal life during the past month?', [
    'Extremely happy, could not have been more satisfied or pleased',
    'Very happy most of the time',
    'Generally, satisfied, pleased',
    'Sometimes fairly satisfied, sometimes fairly unhappy',
    'Generally dissatisfied, unhappy',
    'Very dissatisfied, unhappy most of the time',
  ]],
  ['How much of the time have you felt lonely during the past month?', TIME],
  ['How often did you become nervous or jumpy when faced with excitement or unexpected situations during the past month?', FREQ],
  ['During the past month, how much of the time have you felt that the future looks hopeful and promising?', TIME],
  ['How much of the time, during the past month, has your daily life been full of things that were interesting to you?', TIME],
  ['How much of the time, during the past month, did you feel relaxed and free from tension?', TIME],
  ['During the past month, how much of the time have you generally enjoyed the things you do?', TIME],
  ['During the past month, have you had any reason to wonder if you were losing your mind, or losing control over the way you act, talk, think, feel, or of your memory?', [
    'No, not at all',
    'Maybe a little',
    'Yes, but not enough to be concerned or worried about',
    'Yes, and I have been a little concerned',
    'Yes, and I am quite concerned',
    'Yes, I am very much concerned about it',
  ]],
  ['Did you feel depressed during the past month?', [
    'Yes, to the point that I did not care about anything for days at a time',
    'Yes, very depressed almost every day',
    'Yes, quite depressed several times',
    'Yes, a little depressed now and then',
    'No, never felt depressed at all',
  ]],
  ['During the past month, how much of the time have you felt loved and wanted?', TIME],
  ['How much of the time, during the past month, have you been a very nervous person?', TIME],
  ['When you have got up in the morning, this past month, about how often did you expect to have an interesting day?', FREQ],
  ['During the past month, how much of the time have you felt tense or “high-strung”?', TIME],
  ['During the past month, have you been in firm control of your behaviour, thoughts, emotions or feelings?', [
    'Yes, very definitely',
    'Yes, for the most part',
    'Yes, I guess so',
    'No, not too well',
    'No, and I am somewhat disturbed',
    'No, and I am very disturbed',
  ]],
  ['During the past month, how often did your hands shake when you tried to do something?', FREQ],
  ['During the past month, how often did you feel that you had nothing to look forward to?', FREQ],
  ['How much of the time, during the past month, have you felt calm and peaceful?', TIME],
  ['How much of the time, during the past month, have you felt emotionally stable?', TIME],
  ['How much of the time, during the past month, have you felt downhearted and blue?', TIME],
  ['How often have you felt like crying, during the past month?', FREQ],
  ['During the past month, how often have you felt that others would be better off if you were dead?', FREQ],
  ['How much of the time, during the past month, were you able to relax without difficulty?', TIME],
  ['How much of the time, during the past month, did you feel that your love relationships, loving and being loved, were full and complete?', TIME],
  ['How often, during the past month, did you feel that nothing turned out for you the way you wanted it to?', FREQ],
  ['How much have you been bothered by nervousness, or your “nerves”, during the past month?', [
    'Extremely so, to the point where I could not take care of things',
    'Very much bothered',
    'Bothered quite a bit by nerves',
    'Bothered some, enough to notice',
    'Bothered just a little by nerves',
    'Not bothered at all by this',
  ]],
  ['During the past month, how much of the time has living been a wonderful adventure for you?', TIME],
  ['How often, during the past month, have you felt so down in the dumps that nothing could cheer you up?', FREQ],
  ['During the past month, did you think about taking your own life?', [
    'Yes, very often',
    'Yes, fairly often',
    'Yes, a couple of times',
    'Yes, at one time',
    'No, never',
  ]],
  ['During the past month, how much of the time have you felt restless, fidgety, or impatient?', TIME],
  ['During the past month, how much of the time have you been moody or brooded about things?', TIME],
  ['How much of the time, during the past month, have you felt cheerful, lighthearted?', TIME],
  ['During the past month, how often did you get rattled, upset or flustered?', FREQ],
  ['During the past month, have you been anxious or worried?', [
    'Yes, extremely to the point of being sick or almost sick',
    'Yes, very much so',
    'Yes, quite a bit',
    'Yes, some, enough to bother me',
    'Yes, a little bit',
    'No, not at all',
  ]],
  ['During the past month, how much of the time were you a happy person?', TIME],
  ['How often during the past month did you find yourself trying to calm down?', FREQ],
  ['During the past month, how much of the time have you been in low or very low spirits?', TIME],
  ['How often, during the past month, have you been waking up feeling fresh and rested?', [
    'Always, every day',
    'Almost every day',
    'Most days',
    'Some days, but usually not',
    'Hardly ever',
    'Never wake up feeling rested',
  ]],
  ['During the past month, have you been under or felt you were under any strain, stress or pressure?', [
    'Yes, almost more than I could stand or bear',
    'Yes, quite a bit of pressure',
    'Yes, some more than usual',
    'Yes, some, but about normal',
    'Yes, a little bit',
    'No, not at all',
  ]],
];

const EXCLUDED = ['2', '22', '38'];

/**
 * Item scoring (step 1) derived from Table 1's directionality ("Higher scores = greater …").
 * For each subscale item we check which end of the printed options means MORE of that subscale's construct:
 *   'forward'  – option code 1 is the LEAST of the construct, so score = code
 *                (e.g. item 8 "losing your mind": 1 = "No, not at all" → least loss of control)
 *   'reverse'  – option code 1 is the MOST of the construct, so score = (number of options + 1) − code
 *                (e.g. item 11 "very nervous person": 1 = "All of the time" → most anxiety)
 * Check: with this recoding every subscale's minimum/maximum equals the raw score range printed in Table 1
 * (Anxiety 9–54, Depression 4–23, Loss of control 9–53, Positive affect 10–60, Emotional ties 2–12, Life satisfaction 1–6).
 */
const FORWARD = ['8', '14', '18'];
const SENSITIVE = ['21', '28'];

const subscale = (key, name, ids, rangeNote, description) => ({ key, name, method: 'sum', itemIds: ids, rangeNote, description });

export const mhi38 = {
  assessment: {
    code: 'MHI-38',
    category: 'Mental Health',
    displayOrder: 2,
    name: 'Mental Health Inventory (MHI-38)',
    description: '38-item inventory of psychological distress and well-being over the past month, with six subscales.',
    instructions:
      'Please read each question and tick the box by the ONE statement that best describes how things have been FOR YOU during the past month. There are no right or wrong answers.',
    respondent: 'Self',
    timeframe: 'The past month',
    primaryQuestionType: 'frequency_scale',
    sections: [],
    scoring: {
      enabled: true,
      status: 'configured',
      reverseConstant: null,
      total: { enabled: false, method: 'sum', label: 'Total', bands: [] },
      subscales: [
        subscale('anxiety', 'Anxiety', itemIds(3, 11, 13, 15, 25, 29, 32, 33, 35), '9-54', 'Higher scores = greater Anxiety'),
        subscale('depression', 'Depression', itemIds(9, 19, 30, 36), '4-23', 'Higher scores = greater Depression'),
        subscale(
          'loss_of_control',
          'Loss of Behavioural / Emotional Control',
          itemIds(8, 14, 16, 18, 20, 21, 24, 27, 28),
          '9-53',
          'Higher scores = greater Loss of Behavioural / Emotional Control',
        ),
        subscale('positive_affect', 'General Positive Affect', itemIds(4, 5, 6, 7, 12, 17, 26, 31, 34, 37), '10-60', 'Higher scores = greater Positive Affect'),
        subscale('emotional_ties', 'Emotional Ties', itemIds(10, 23), '2-12', 'Higher scores = stronger Emotional Ties'),
        subscale('life_satisfaction', 'Life Satisfaction', itemIds(1), '1-6', 'Higher scores = greater Life Satisfaction'),
      ],
      outputs: [],
      interpretationNote:
        'Subscale raw scores per Table 1 (higher = more of the named construct). Item recoding was derived from Table 1 directionality and reproduces its raw score ranges; no norms or cutoffs are supplied, so levels show position within the possible range only.',
    },
    sourceNotes: [
      'Subscale item composition, directionality and raw score ranges are transcribed from Table 1. Items 2, 22 and 38 are not used to score the subscales.',
      'Items 21 and 28 concern thoughts of death / taking one’s own life and are marked sensitive so clinicians see them highlighted. No automatic triage rule is configured — define review triggers in the question builder.',
      '"(Tick one)" markers after each question were omitted because the interface allows exactly one answer.',
    ],
    discrepancies: [
      'Item-level recoding (step 1) is not printed in the source. It was derived from Table 1 directionality: items 8, 14 and 18 score as printed; all other subscale items are reversed (number of options + 1 − code). This reproduces every raw score range in Table 1 — please confirm with the assessment administrator.',
      'No normative ranges, total score or clinical cutoffs are supplied.',
    ],
  },
  questions: buildQuestions(
    items.map(([text, labels], i) => {
      const id = String(i + 1);
      const options = scaleOptions(labels);
      // Excluded items keep their printed code; subscale items are scored in Table 1's direction.
      if (!EXCLUDED.includes(id) && !FORWARD.includes(id)) options.forEach((o) => (o.score = options.length + 1 - Number(o.value)));
      return { text, options, excludedFromScoring: EXCLUDED.includes(id), sensitive: SENSITIVE.includes(id) };
    }),
    { type: 'frequency_scale' },
  ),
};
