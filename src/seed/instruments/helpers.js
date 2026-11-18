export const scaleOptions = (labels, { startAt = 1 } = {}) =>
  labels.map((label, i) => ({ label, value: String(startAt + i), score: startAt + i }));

/** Build question docs from [{ text, ...overrides }] using a default option set/type. */
export const buildQuestions = (items, defaults) =>
  items.map((item, index) => ({
    itemId: String(index + 1),
    order: index + 1,
    required: true,
    ...defaults,
    ...item,
  }));

export const itemIds = (...numbers) => numbers.map(String);
export const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => String(from + i));
