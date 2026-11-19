import { Question } from '../../assessments/model/question.model.js';
import { ensureEditable, findAssessmentOr404, markChanged } from '../../assessments/service/assessment.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { ACTIONS, logActivity } from '../../activity/service/activity.service.js';

// Question edits change the DRAFT only. Patients keep answering the live version until the next Publish.

const FIELDS = ['text', 'helpText', 'type', 'options', 'required', 'reverseScored', 'excludedFromScoring', 'sensitive'];

/** Normalises and validates a question's type and answer options. */
const cleanQuestion = (q) => {
  if (q.type === 'text') {
    q.options = [];
    return q;
  }
  const options = q.options || [];
  if (options.length < 2) throw ApiError.badRequest('Add at least two answer options');
  if (q.type === 'yes_no' && options.length !== 2) throw ApiError.badRequest('Yes / No questions need exactly two options');
  q.options = options.map((o, i) => {
    const label = String(o.label ?? '').trim();
    if (!label) throw ApiError.badRequest(`Answer option ${i + 1} needs a label`);
    const score = o.score === '' || o.score === null || o.score === undefined ? null : Number(o.score);
    if (score !== null && Number.isNaN(score)) throw ApiError.badRequest(`Answer option ${i + 1} has an invalid score`);
    return { label, value: String(o.value ?? i + 1).trim() || String(i + 1), score, description: o.description };
  });
  if (new Set(q.options.map((o) => o.value)).size !== q.options.length) throw ApiError.badRequest('Answer option values must be unique');
  return q;
};

const pick = (data) => Object.fromEntries(FIELDS.filter((f) => data[f] !== undefined).map((f) => [f, data[f]]));

export const listQuestions = (assessmentId) => Question.find({ assessment: assessmentId }).sort({ order: 1 }).lean();

export const addQuestion = async (assessmentId, data, actor) => {
  const assessment = await findAssessmentOr404(assessmentId);
  ensureEditable(assessment);
  const existing = await Question.find({ assessment: assessmentId }).select('itemId order').lean();
  // itemId is a stable identifier that never changes, even when questions are reordered.
  const itemId = String(existing.reduce((max, q) => Math.max(max, Number(q.itemId) || 0), 0) + 1);
  const order = existing.reduce((max, q) => Math.max(max, q.order), 0) + 1;
  const question = await Question.create({ ...cleanQuestion(pick(data)), assessment: assessmentId, itemId, order });
  await markChanged(assessmentId, actor);
  await logActivity({ actor, action: ACTIONS.QUESTION_UPDATED, category: 'content', message: `${actor.name} added question ${order} to ${assessment.code}`, entityType: 'Assessment', entityId: assessment._id });
  return question.toObject();
};

export const updateQuestion = async (questionId, data, actor) => {
  const question = await Question.findById(questionId);
  if (!question) throw ApiError.notFound('Question not found');
  const assessment = await findAssessmentOr404(question.assessment);
  ensureEditable(assessment);
  const before = question.text;
  const merged = cleanQuestion({ ...question.toObject(), ...pick(data) });
  FIELDS.forEach((f) => {
    if (merged[f] !== undefined) question[f] = merged[f];
  });
  await question.save();
  await markChanged(assessment._id, actor);
  await logActivity({
    actor,
    action: ACTIONS.QUESTION_UPDATED,
    category: 'content',
    message: before !== question.text ? `${actor.name} updated question ${question.order} wording in ${assessment.code}` : `${actor.name} updated question ${question.order} in ${assessment.code}`,
    entityType: 'Assessment',
    entityId: assessment._id,
    metadata: before !== question.text ? { before, after: question.text } : undefined,
  });
  return question.toObject();
};

/** Deleting is blocked while a scoring rule (subscale) uses the question, so scoring can never silently break. */
export const deleteQuestion = async (questionId, actor) => {
  const question = await Question.findById(questionId);
  if (!question) throw ApiError.notFound('Question not found');
  const assessment = await findAssessmentOr404(question.assessment);
  ensureEditable(assessment);
  const usedBy = (assessment.scoring?.subscales || []).filter((s) => s.itemIds.includes(question.itemId)).map((s) => s.name);
  if (usedBy.length) throw ApiError.conflict(`This question is used by the scoring of: ${usedBy.join(', ')}. It cannot be deleted.`);
  await question.deleteOne();
  const remaining = await Question.find({ assessment: assessment._id }).sort({ order: 1 });
  await Question.bulkWrite(remaining.map((q, i) => ({ updateOne: { filter: { _id: q._id }, update: { order: i + 1 } } })));
  await markChanged(assessment._id, actor);
  await logActivity({ actor, action: ACTIONS.QUESTION_UPDATED, category: 'content', message: `${actor.name} deleted a question from ${assessment.code}`, entityType: 'Assessment', entityId: assessment._id, metadata: { deletedText: question.text } });
  return listQuestions(assessment._id);
};

export const reorderQuestions = async (assessmentId, orderedIds, actor) => {
  const assessment = await findAssessmentOr404(assessmentId);
  ensureEditable(assessment);
  const ids = new Set((await Question.find({ assessment: assessmentId }).select('_id').lean()).map((q) => String(q._id)));
  if (orderedIds.length !== ids.size || !orderedIds.every((id) => ids.has(String(id)))) throw ApiError.badRequest('The new order must include every question exactly once');
  await Question.bulkWrite(orderedIds.map((id, i) => ({ updateOne: { filter: { _id: id }, update: { order: i + 1 } } })));
  await markChanged(assessmentId, actor);
  return listQuestions(assessmentId);
};
