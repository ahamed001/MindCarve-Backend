/**
 * Reusable, assessment-agnostic scoring engine.
 *
 * It is driven entirely by the configuration stored on an assessment version:
 *   - per-question option scores (numeric mapping, yes/no mapping)
 *   - per-question reverse scoring (reversed = scoring.reverseConstant - score)
 *   - per-question exclusion from scoring
 *   - subscales (sum | mean) with optional cutoffs and bands
 *   - total (sum | mean) with optional bands carrying a configurable risk level
 *   - additional outputs mapped from total/subscale via bands (e.g. a % table)
 *
 * It never invents interpretation: if scoring is not enabled the result status is
 * 'not_configured', and if any scored item is unanswered the status is 'incomplete'
 * and no totals are produced.
 */

const RISK_ORDER = { low: 1, moderate: 2, high: 3 };

const round = (n, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

export const findBand = (bands = [], value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return (
    bands.find((b) => (b.min === null || b.min === undefined || value >= b.min) && (b.max === null || b.max === undefined || value <= b.max)) ||
    null
  );
};

const aggregate = (values, method) => {
  if (!values.length) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return method === 'mean' ? round(sum / values.length) : round(sum);
};

/** Supported cutoff comparison operators (configured per subscale / total). Default: 'gte' (score >= cutoff). */
export const CUTOFF_OPERATORS = { gte: (v, c) => v >= c, gt: (v, c) => v > c };

export const meetsCutoff = (value, cutoff) => {
  if (!cutoff || cutoff.value === null || cutoff.value === undefined) return null;
  if (value === null || value === undefined) return null;
  const compare = CUTOFF_OPERATORS[cutoff.operator || 'gte'];
  if (!compare) throw new Error(`Unsupported cutoff operator "${cutoff.operator}"`);
  return compare(value, cutoff.value);
};

const hasCutoff = (cutoff) => cutoff && cutoff.value !== null && cutoff.value !== undefined;

const isScorable = (q) => q.type !== 'text' && !q.excludedFromScoring;

/** Lowest and highest score a single item can contribute (after reverse scoring). */
export const itemRange = (question, reverseConstant) => {
  const scores = (question.options || []).map((o) => o.score).filter((v) => typeof v === 'number');
  if (!scores.length) return null;
  let min;
  let max;
  if (question.type === 'multiple_choice') {
    min = Math.min(0, ...scores);
    max = scores.filter((v) => v > 0).reduce((a, b) => a + b, 0);
  } else {
    min = Math.min(...scores);
    max = Math.max(...scores);
  }
  if (question.reverseScored && typeof reverseConstant === 'number') [min, max] = [reverseConstant - max, reverseConstant - min];
  return { min, max };
};

/**
 * Where a score sits within its possible range, in thirds: 'low' | 'mid' | 'high'.
 * This is a range position only — NOT a clinical norm. Clinical meaning comes from configured bands/cutoffs.
 */
export const rangePosition = (score, min, max) => {
  if ([score, min, max].some((v) => typeof v !== 'number') || max <= min) return null;
  const pct = (score - min) / (max - min);
  if (pct < 1 / 3) return 'low';
  if (pct >= 2 / 3) return 'high';
  return 'mid';
};

const rangeOf = (ranges, method) => {
  if (!ranges.length || ranges.some((r) => !r)) return { min: null, max: null };
  const min = aggregate(ranges.map((r) => r.min), method);
  const max = aggregate(ranges.map((r) => r.max), method);
  return { min, max };
};

/** Resolve the raw (pre-reversal) score for one answer. Returns null when unanswered/unscored. */
export const rawScoreFor = (question, answer) => {
  if (!answer) return null;
  if (question.type === 'multiple_choice') {
    const selected = (answer.values || [])
      .map((v) => question.options.find((o) => o.value === v))
      .filter((o) => o && typeof o.score === 'number');
    if (!selected.length) return null;
    return selected.reduce((sum, o) => sum + o.score, 0);
  }
  const option = (question.options || []).find((o) => o.value === answer.value);
  return option && typeof option.score === 'number' ? option.score : null;
};

export const isAnswered = (question, answer) => {
  if (!answer) return false;
  if (question.type === 'text') return Boolean(answer.text && answer.text.trim());
  if (question.type === 'multiple_choice') return Array.isArray(answer.values) && answer.values.length > 0;
  return Boolean(answer.value) && (question.options || []).some((o) => o.value === answer.value);
};

const collectFlags = (questions, answerMap) => {
  const flags = [];
  questions.forEach((q, index) => {
    const answer = answerMap.get(q.itemId);
    if (!isAnswered(q, answer)) return;
    const selectedValues = q.type === 'multiple_choice' ? answer.values : [answer.value];
    const labels = selectedValues
      .map((v) => q.options?.find((o) => o.value === v)?.label)
      .filter(Boolean);
    const base = { itemId: q.itemId, questionNumber: index + 1, questionText: q.text, answerLabel: labels.join(', ') || answer.text };
    if (q.sensitive) flags.push({ ...base, type: 'sensitive_item' });
    if (q.reviewTriggerValues?.length && selectedValues.some((v) => q.reviewTriggerValues.includes(v))) {
      flags.push({ ...base, type: 'review_trigger' });
    }
  });
  return flags;
};

/**
 * @param {{questions: object[], scoring: object}} snapshot assessment version snapshot
 * @param {Array<{itemId: string, value?: string, values?: string[], text?: string}>} answers
 */
export const scoreAssessment = (snapshot, answers = []) => {
  const questions = [...(snapshot.questions || [])].sort((a, b) => a.order - b.order);
  const scoring = snapshot.scoring || {};
  const answerMap = new Map(answers.map((a) => [a.itemId, a]));
  const flags = collectFlags(questions, answerMap);

  const base = { total: null, subscales: [], outputs: [], riskLevel: null, flags, notes: [] };

  if (!scoring.enabled) {
    return {
      ...base,
      status: 'not_configured',
      notes: [scoring.interpretationNote || 'Automated scoring is awaiting clinician configuration. Raw responses are stored.'],
    };
  }

  const itemScores = new Map();
  const missing = [];

  questions.forEach((q, index) => {
    if (!isScorable(q)) return;
    const raw = rawScoreFor(q, answerMap.get(q.itemId));
    if (raw === null) {
      missing.push(index + 1);
      return;
    }
    let score = raw;
    if (q.reverseScored) {
      if (typeof scoring.reverseConstant !== 'number') {
        throw new Error(`Question ${q.itemId} is reverse-scored but no reverseConstant is configured`);
      }
      score = scoring.reverseConstant - raw;
    }
    itemScores.set(q.itemId, { raw, score, reversed: Boolean(q.reverseScored) });
  });

  const ranges = new Map(questions.filter(isScorable).map((q) => [q.itemId, itemRange(q, scoring.reverseConstant)]));

  if (missing.length) {
    return {
      ...base,
      status: 'incomplete',
      notes: [`Scores were not calculated because ${missing.length} scored item(s) are unanswered: ${missing.join(', ')}.`],
    };
  }

  const subscales = (scoring.subscales || []).map((sub) => {
    const values = sub.itemIds.map((id) => itemScores.get(id)?.score).filter((v) => typeof v === 'number');
    const score = values.length === sub.itemIds.length ? aggregate(values, sub.method) : null;
    const band = findBand(sub.bands, score);
    const cutoffMet = score === null ? null : meetsCutoff(score, sub.cutoff);
    const { min, max } = rangeOf(sub.itemIds.map((id) => ranges.get(id)), sub.method || 'sum');
    return {
      key: sub.key,
      name: sub.name,
      method: sub.method || 'sum',
      itemIds: sub.itemIds,
      score,
      min,
      max,
      position: rangePosition(score, min, max),
      band: band ? { label: band.label, riskLevel: band.riskLevel ?? null, description: band.description } : null,
      cutoff: hasCutoff(sub.cutoff) ? { value: sub.cutoff.value, operator: sub.cutoff.operator || 'gte', label: sub.cutoff.label } : null,
      meetsCutoff: cutoffMet,
    };
  });

  let total = null;
  if (scoring.total?.enabled !== false) {
    const values = [...itemScores.values()].map((s) => s.score);
    const score = aggregate(values, scoring.total?.method || 'sum');
    const band = findBand(scoring.total?.bands, score);
    const { min, max } = rangeOf([...itemScores.keys()].map((id) => ranges.get(id)), scoring.total?.method || 'sum');
    total = {
      label: scoring.total?.label || 'Total score',
      method: scoring.total?.method || 'sum',
      score,
      min,
      max,
      position: rangePosition(score, min, max),
      itemCount: values.length,
      band: band ? { label: band.label, riskLevel: band.riskLevel ?? null, description: band.description } : null,
      cutoff: hasCutoff(scoring.total?.cutoff) ? { value: scoring.total.cutoff.value, operator: scoring.total.cutoff.operator || 'gte', label: scoring.total.cutoff.label } : null,
      meetsCutoff: meetsCutoff(score, scoring.total?.cutoff),
    };
  }

  const sourceValue = (source) => {
    if (!source || source === 'total') return total?.score ?? null;
    return subscales.find((s) => s.key === source)?.score ?? null;
  };

  const outputs = (scoring.outputs || []).map((out) => {
    const input = sourceValue(out.source);
    const band = findBand(out.bands, input);
    return {
      key: out.key,
      name: out.name,
      source: out.source || 'total',
      input,
      value: band ? band.value ?? null : null,
      // No matching row in the source table: value stays null — never a made-up value such as 0%.
      label: band ? band.label : out.unmatchedLabel || 'Not specified in reference',
      note: out.note,
    };
  });

  const riskCandidates = [total?.band?.riskLevel, ...subscales.map((s) => s.band?.riskLevel)].filter(Boolean);
  const riskLevel = riskCandidates.reduce((max, r) => (!max || RISK_ORDER[r] > RISK_ORDER[max] ? r : max), null);

  return {
    ...base,
    status: 'scored',
    total,
    subscales,
    outputs,
    riskLevel,
    itemScores: Object.fromEntries(itemScores),
    notes: scoring.interpretationNote ? [scoring.interpretationNote] : [],
  };
};
