import { Assessment } from '../model/assessment.model.js';
import { AssessmentVersion } from '../model/assessmentVersion.model.js';
import { Question } from '../model/question.model.js';
import { Assignment } from '../../assignments/model/assignment.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { ASSESSMENT_STATUS } from '../../utils/constants.js';
import { escapeRegex } from '../../utils/pagination.js';
import { ACTIONS, logActivity } from '../../activity/service/activity.service.js';

export const toSnapshotQuestion = (q) => ({
  itemId: q.itemId,
  order: q.order,
  sectionKey: q.sectionKey ?? null,
  text: q.text,
  helpText: q.helpText,
  type: q.type,
  options: (q.options || []).map((o) => ({ label: o.label, value: o.value, score: o.score ?? null, description: o.description })),
  required: q.required,
  reverseScored: Boolean(q.reverseScored),
  excludedFromScoring: Boolean(q.excludedFromScoring),
  sensitive: Boolean(q.sensitive),
  reviewTriggerValues: q.reviewTriggerValues || [],
});

export const findAssessmentOr404 = async (id) => {
  const assessment = await Assessment.findById(id);
  if (!assessment) throw ApiError.notFound('Assessment not found');
  return assessment;
};

/** Validates that a scoring configuration only references real questions and is internally consistent. */
export const validateScoring = (scoring, questions) => {
  const errors = [];
  if (!scoring) return errors;
  const ids = new Set(questions.map((q) => q.itemId));
  const keys = new Set();

  (scoring.subscales || []).forEach((s) => {
    if (!s.key || !s.name) errors.push('Every subscale needs a key and name');
    if (keys.has(s.key)) errors.push(`Duplicate subscale key "${s.key}"`);
    keys.add(s.key);
    if (!s.itemIds?.length) errors.push(`Subscale "${s.name}" has no items`);
    (s.itemIds || []).forEach((id) => {
      if (!ids.has(id)) errors.push(`Subscale "${s.name}" references a question that does not exist`);
    });
  });

  const checkBands = (bands = [], label) =>
    bands.forEach((b) => {
      if (!b.label) errors.push(`${label}: every band needs a label`);
      if (b.min !== null && b.min !== undefined && b.max !== null && b.max !== undefined && b.min > b.max) {
        errors.push(`${label}: band "${b.label}" has min greater than max`);
      }
    });
  checkBands(scoring.total?.bands, 'Total');
  (scoring.subscales || []).forEach((s) => checkBands(s.bands, s.name));
  (scoring.outputs || []).forEach((o) => {
    checkBands(o.bands, o.name);
    if (o.source && o.source !== 'total' && !keys.has(o.source)) errors.push(`Output "${o.name}" references an unknown subscale`);
  });

  if (scoring.enabled && questions.some((q) => q.reverseScored) && typeof scoring.reverseConstant !== 'number') {
    errors.push('Reverse-scored questions require a reverse-score constant (reversed = constant − score)');
  }
  if (scoring.enabled) {
    questions
      .filter((q) => q.type !== 'text' && !q.excludedFromScoring)
      .forEach((q, i) => {
        if ((q.options || []).some((o) => typeof o.score !== 'number')) {
          errors.push(`Question ${i + 1} has options without a numeric score`);
        }
      });
  }
  return [...new Set(errors)];
};

export const listAssessments = async ({ search, status } = {}) => {
  const filter = {};
  if (status === 'inactive') filter.status = { $ne: ASSESSMENT_STATUS.PUBLISHED };
  else if (status) filter.status = status;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: rx }, { code: rx }, { description: rx }, { category: rx }];
  }
  const assessments = await Assessment.find(filter).sort({ code: 1 }).lean();
  const counts = await Question.aggregate([
    { $match: { assessment: { $in: assessments.map((a) => a._id) } } },
    { $group: { _id: '$assessment', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
  return assessments.map((a) => ({
    ...a,
    questionCount: countMap.get(String(a._id)) || 0,
    sectionCount: a.sections?.length || 0,
    subscaleCount: a.scoring?.subscales?.length || 0,
  }));
};

export const getAssessment = async (id) => {
  const assessment = await Assessment.findById(id).lean();
  if (!assessment) throw ApiError.notFound('Assessment not found');
  const [questions, versions, assignmentCount] = await Promise.all([
    Question.find({ assessment: id }).sort({ order: 1 }).lean(),
    AssessmentVersion.find({ assessment: id }).select('version publishedAt publishedBy').sort({ version: -1 }).populate('publishedBy', 'name').lean(),
    Assignment.countDocuments({ assessment: id }),
  ]);
  return { ...assessment, questions, versions, assignmentCount };
};

/** Publishing creates a new immutable version snapshot used by all future assignments (used internally by the seed). */
export const publishAssessment = async (id, actor) => {
  const assessment = await findAssessmentOr404(id);
  if (assessment.status === ASSESSMENT_STATUS.ARCHIVED) throw ApiError.badRequest('Restore this assessment before publishing it');

  const questions = await Question.find({ assessment: id }).sort({ order: 1 }).lean();
  if (!questions.length) throw ApiError.badRequest('Add at least one question before publishing');
  questions.forEach((q, i) => {
    if (q.type !== 'text' && (q.options || []).length < 2) throw ApiError.badRequest(`Question ${i + 1} needs at least two answer options`);
  });
  const scoring = assessment.scoring?.toObject ? assessment.scoring.toObject() : assessment.scoring;
  const errors = validateScoring(scoring, questions);
  if (errors.length) throw ApiError.badRequest(errors[0], errors.map((message) => ({ field: 'scoring', message })));

  const version = await AssessmentVersion.create({
    assessment: assessment._id,
    version: assessment.currentVersion + 1,
    code: assessment.code,
    name: assessment.name,
    description: assessment.description,
    instructions: assessment.instructions,
    respondent: assessment.respondent,
    timeframe: assessment.timeframe,
    sections: (assessment.sections || []).map((s) => (s.toObject ? s.toObject() : s)),
    questions: questions.map(toSnapshotQuestion),
    scoring,
    discrepancies: assessment.discrepancies,
    publishedBy: actor?._id,
  });

  assessment.currentVersion = version.version;
  assessment.publishedVersion = version._id;
  assessment.status = ASSESSMENT_STATUS.PUBLISHED;
  assessment.hasUnpublishedChanges = false;
  assessment.updatedBy = actor?._id;
  await assessment.save();

  if (actor) {
    await logActivity({
      actor,
      action: ACTIONS.ASSESSMENT_PUBLISHED,
      category: 'content',
      message: `${actor.name} published ${assessment.code} version ${version.version}`,
      entityType: 'Assessment',
      entityId: assessment._id,
      metadata: { version: version.version },
    });
  }
  return getAssessment(id);
};

export const getVersion = async (versionId) => {
  const version = await AssessmentVersion.findById(versionId).lean();
  if (!version) throw ApiError.notFound('Assessment version not found');
  return version;
};
