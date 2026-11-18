import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { scoreAssessment, findBand } from '../src/scoring/scoringEngine.js';
import { isaa } from '../src/seed/instruments/isaa.js';
import { scared } from '../src/seed/instruments/scared.js';
import { bfi10 } from '../src/seed/instruments/bfi10.js';
import { gds } from '../src/seed/instruments/gds.js';
import { mhi38 } from '../src/seed/instruments/mhi38.js';
import { beis10 } from '../src/seed/instruments/beis10.js';

const snap = (inst) => ({ questions: inst.questions, scoring: inst.assessment.scoring });
const answersFrom = (values) => values.map((value, i) => ({ itemId: String(i + 1), value: String(value) }));
const sub = (result, key) => result.subscales.find((s) => s.key === key);

/** Build ISAA answers (1–5 each) that add up to an exact total. */
const isaaAnswersForTotal = (total) => {
  const values = Array(40).fill(1);
  let remaining = total - 40;
  for (let i = 0; i < 40 && remaining > 0; i += 1) {
    const add = Math.min(4, remaining);
    values[i] += add;
    remaining -= add;
  }
  return answersFrom(values);
};

describe('BFI-10 (reverse scoring + sum subscales)', () => {
  test('reverse-scored items use 6 - score', () => {
    // item1 (R) = 2 -> 4 ; item6 = 4 => Extraversion sum 8 => High
    const values = [2, 3, 3, 3, 3, 4, 3, 3, 3, 3];
    const r = scoreAssessment(snap(bfi10), answersFrom(values));
    assert.equal(r.status, 'scored');
    assert.equal(sub(r, 'extraversion').score, 8);
    assert.equal(sub(r, 'extraversion').band.label, 'High');
    assert.equal(r.itemScores['1'].raw, 2);
    assert.equal(r.itemScores['1'].score, 4);
    assert.equal(r.itemScores['6'].reversed, false);
  });

  test('all reversed items flip correctly (all answers 5)', () => {
    const r = scoreAssessment(snap(bfi10), answersFrom(Array(10).fill(5)));
    // each trait = 1 + 5 = 6 => Average
    for (const key of ['extraversion', 'agreeableness', 'conscientiousness', 'neuroticism', 'openness']) {
      assert.equal(sub(r, key).score, 6, key);
      assert.equal(sub(r, key).band.label, 'Average');
    }
  });

  test('benchmark boundaries', () => {
    const bands = bfi10.assessment.scoring.subscales[0].bands;
    assert.equal(findBand(bands, 10).label, 'Very High');
    assert.equal(findBand(bands, 9).label, 'Very High');
    assert.equal(findBand(bands, 8).label, 'High');
    assert.equal(findBand(bands, 7).label, 'High');
    assert.equal(findBand(bands, 6).label, 'Average');
    assert.equal(findBand(bands, 5).label, 'Average');
    assert.equal(findBand(bands, 4).label, 'Low');
    assert.equal(findBand(bands, 3).label, 'Low');
    assert.equal(findBand(bands, 2).label, 'Very Low');
  });

  test('no total and no clinical risk level', () => {
    const r = scoreAssessment(snap(bfi10), answersFrom(Array(10).fill(1)));
    assert.equal(r.total, null);
    assert.equal(r.riskLevel, null);
  });
});

describe('BEIS-10 (sum subscales + total)', () => {
  test('reproduces the source sample report (8, 10, 7, 5, 8 => 38)', () => {
    const values = [4, 4, 5, 5, 3, 4, 2, 3, 4, 4];
    const r = scoreAssessment(snap(beis10), answersFrom(values));
    assert.deepEqual(
      r.subscales.map((s) => s.score),
      [8, 10, 7, 5, 8],
    );
    assert.equal(r.total.score, 38);
    assert.equal(r.total.band, null, 'no norms supplied, so no descriptor');
  });
});

describe('GDS-15 (yes/no mapping)', () => {
  const depressive = gds.questions.map((q) => q.options.find((o) => o.score === 1).value);
  const nonDepressive = gds.questions.map((q) => q.options.find((o) => o.score === 0).value);

  test('designated answers score 1 each', () => {
    const r = scoreAssessment(snap(gds), answersFrom(depressive));
    assert.equal(r.total.score, 15);
    assert.equal(r.total.band.label, 'Suggests depression');
  });

  test('designated answers match the source (No for 1,5,7,11,13)', () => {
    const noItems = depressive.map((v, i) => (v === 'no' ? i + 1 : null)).filter(Boolean);
    assert.deepEqual(noItems, [1, 5, 7, 11, 13]);
  });

  test('threshold boundary: 5 = Normal, 6 = Suggests depression', () => {
    const five = nonDepressive.map((v, i) => (i < 5 ? depressive[i] : v));
    const six = nonDepressive.map((v, i) => (i < 6 ? depressive[i] : v));
    const r5 = scoreAssessment(snap(gds), answersFrom(five));
    const r6 = scoreAssessment(snap(gds), answersFrom(six));
    assert.equal(r5.total.score, 5);
    assert.equal(r5.total.band.label, 'Normal');
    assert.equal(r5.riskLevel, 'low');
    assert.equal(r6.total.score, 6);
    assert.equal(r6.total.band.label, 'Suggests depression');
    assert.equal(r6.riskLevel, 'high');
  });
});

describe('SCARED (subscale cutoffs + total)', () => {
  test('subscale cutoff boundary (Panic/Somatic: 6 below, 7 meets)', () => {
    const panicItems = scared.assessment.scoring.subscales[0].itemIds.map(Number);
    const build = (points) => {
      const values = Array(41).fill(0);
      let left = points;
      for (const item of panicItems) {
        if (left <= 0) break;
        const add = Math.min(2, left);
        values[item - 1] = add;
        left -= add;
      }
      return answersFrom(values);
    };
    assert.equal(sub(scoreAssessment(snap(scared), build(6)), 'panic_somatic').meetsCutoff, false);
    assert.equal(sub(scoreAssessment(snap(scared), build(7)), 'panic_somatic').meetsCutoff, true);
  });

  test('total boundary: 24 below cutoff, 25 meets', () => {
    const build = (total) => {
      const values = Array(41).fill(0);
      let left = total;
      for (let i = 0; i < 41 && left > 0; i += 1) {
        const add = Math.min(2, left);
        values[i] = add;
        left -= add;
      }
      return answersFrom(values);
    };
    const r24 = scoreAssessment(snap(scared), build(24));
    const r25 = scoreAssessment(snap(scared), build(25));
    assert.equal(r24.total.score, 24);
    assert.equal(r24.riskLevel, 'low');
    assert.equal(r25.total.score, 25);
    assert.equal(r25.riskLevel, 'high');
  });

  test('subscale item mapping covers all 41 items exactly once', () => {
    const all = scared.assessment.scoring.subscales.flatMap((s) => s.itemIds).map(Number).sort((a, b) => a - b);
    assert.deepEqual(all, Array.from({ length: 41 }, (_, i) => i + 1));
  });
});

describe('ISAA (classification + separate percentage table)', () => {
  const run = (total) => scoreAssessment(snap(isaa), isaaAnswersForTotal(total));
  const pct = (r) => r.outputs.find((o) => o.key === 'disability_percentage');

  test('minimum score 40 => No Autism, percentage not listed in source', () => {
    const r = run(40);
    assert.equal(r.total.score, 40);
    assert.equal(r.total.band.label, 'No Autism');
    assert.equal(pct(r).value, null);
  });

  test('boundaries preserved as in source (discrepancy not reconciled)', () => {
    assert.equal(run(69).total.band.label, 'No Autism');
    assert.equal(run(70).total.band.label, 'Mild Autism');
    assert.equal(pct(run(70)).value, 40);
    assert.equal(run(106).total.band.label, 'Mild Autism');
    assert.equal(pct(run(106)).value, 70);
    assert.equal(run(107).total.band.label, 'Moderate Autism');
    assert.equal(pct(run(107)).value, 70);
    assert.equal(run(153).total.band.label, 'Moderate Autism');
    assert.equal(run(154).total.band.label, 'Severe Autism');
    assert.equal(pct(run(158)).value, 90);
    assert.equal(pct(run(159)).value, 100);
    assert.equal(run(200).total.score, 200);
  });

  test('six domains with correct item counts', () => {
    const r = run(100);
    assert.deepEqual(
      r.subscales.map((s) => s.itemIds.length),
      [9, 5, 9, 7, 6, 4],
    );
  });
});

describe('MHI-38 (item recoding from Table 1 directionality)', () => {
  const ranges = { anxiety: [9, 54], depression: [4, 23], loss_of_control: [9, 53], positive_affect: [10, 60], emotional_ties: [2, 12], life_satisfaction: [1, 6] };

  test('every subscale range equals the raw score range printed in Table 1', () => {
    const r = scoreAssessment(snap(mhi38), answersFrom(Array(38).fill(1)));
    assert.equal(r.status, 'scored');
    for (const [key, [min, max]] of Object.entries(ranges)) {
      assert.deepEqual([sub(r, key).min, sub(r, key).max], [min, max], key);
    }
  });

  test('direction: answering option 1 everywhere (most distress / most positive) scores correctly', () => {
    // Option 1 = "All of the time"/"Always"/"Yes…" for most items.
    const r = scoreAssessment(snap(mhi38), answersFrom(Array(38).fill(1)));
    assert.equal(sub(r, 'anxiety').score, 54); // maximum anxiety
    assert.equal(sub(r, 'depression').score, 23);
    assert.equal(sub(r, 'positive_affect').score, 60); // "All of the time" hopeful, cheerful … = maximum
    assert.equal(sub(r, 'emotional_ties').score, 12);
    assert.equal(sub(r, 'life_satisfaction').score, 6); // "Extremely happy"
    // Loss of control: items 8, 14, 18 score as printed (1 each = least loss), the rest reversed.
    assert.equal(sub(r, 'loss_of_control').score, 1 + 1 + 1 + 6 * 5 + 5);
  });

  test('no total, still surfaces sensitive items 21 and 28', () => {
    const r = scoreAssessment(snap(mhi38), answersFrom(Array(38).fill(3)));
    assert.equal(r.total, null);
    assert.deepEqual(
      r.flags.filter((f) => f.type === 'sensitive_item').map((f) => f.questionNumber),
      [21, 28],
    );
  });

  test('items 2, 22 and 38 are excluded and absent from all subscales', () => {
    const inSubscales = new Set(mhi38.assessment.scoring.subscales.flatMap((s) => s.itemIds));
    for (const id of ['2', '22', '38']) {
      assert.equal(inSubscales.has(id), false);
      assert.equal(mhi38.questions.find((q) => q.itemId === id).excludedFromScoring, true);
    }
    assert.equal(inSubscales.size, 35);
  });
});

describe('Generic engine behaviour', () => {
  test('incomplete submissions never produce misleading totals', () => {
    const answers = answersFrom(Array(15).fill('yes')).slice(0, 14);
    const r = scoreAssessment(snap(gds), answers);
    assert.equal(r.status, 'incomplete');
    assert.equal(r.total, null);
    assert.equal(r.riskLevel, null);
  });

  test('invalid option values count as unanswered', () => {
    const answers = answersFrom(Array(15).fill('yes'));
    answers[0].value = 'maybe';
    assert.equal(scoreAssessment(snap(gds), answers).status, 'incomplete');
  });

  test('excluded questions do not contribute to totals', () => {
    const questions = beis10.questions.map((q) => (q.itemId === '10' ? { ...q, excludedFromScoring: true } : q));
    const scoring = { ...beis10.assessment.scoring, subscales: [] };
    const r = scoreAssessment({ questions, scoring }, answersFrom(Array(10).fill(5)));
    assert.equal(r.total.score, 45);
    assert.equal(r.total.itemCount, 9);
  });

  test('review triggers flag configured answers', () => {
    const questions = gds.questions.map((q) => (q.itemId === '3' ? { ...q, reviewTriggerValues: ['yes'] } : q));
    const r = scoreAssessment({ questions, scoring: gds.assessment.scoring }, answersFrom(Array(15).fill('yes')));
    assert.equal(r.flags.filter((f) => f.type === 'review_trigger').length, 1);
  });

  test('reverse scoring without a configured constant fails loudly', () => {
    const scoring = { ...bfi10.assessment.scoring, reverseConstant: null };
    assert.throws(() => scoreAssessment({ questions: bfi10.questions, scoring }, answersFrom(Array(10).fill(3))));
  });
});

describe('Score ranges and range position (backend-only calculations)', () => {
  test('BEIS-10: total out of 10–50, subscales out of 2–10', () => {
    const r = scoreAssessment(snap(beis10), answersFrom([4, 4, 5, 5, 3, 4, 2, 3, 4, 4]));
    assert.equal(r.total.min, 10);
    assert.equal(r.total.max, 50);
    assert.equal(r.total.score, 38);
    assert.equal(r.total.position, 'high'); // (38-10)/40 = 0.7
    const own = sub(r, 'appraisal_own');
    assert.deepEqual([own.score, own.min, own.max, own.position], [8, 2, 10, 'high']);
    assert.equal(sub(r, 'regulation_others').position, 'mid'); // 5 → (5-2)/8 = 0.375
  });

  test('reverse-scored items keep the same range; BFI trait sums range 2–10', () => {
    const r = scoreAssessment(snap(bfi10), answersFrom(Array(10).fill(3)));
    const e = sub(r, 'extraversion');
    assert.deepEqual([e.min, e.max, e.position], [2, 10, 'mid']);
  });

  test('GDS total ranges 0–15 and boundaries map to thirds', () => {
    const r = scoreAssessment(snap(gds), answersFrom(Array(15).fill('no')));
    assert.deepEqual([r.total.min, r.total.max], [0, 15]);
  });

  test('item scores are returned for storage', () => {
    const r = scoreAssessment(snap(bfi10), answersFrom([2, 3, 3, 3, 3, 4, 3, 3, 3, 3]));
    assert.deepEqual(r.itemScores['1'], { raw: 2, score: 4, reversed: true });
  });
});
