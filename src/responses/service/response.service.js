import { Assignment } from '../../assignments/model/assignment.model.js';
import { AssessmentVersion } from '../../assessments/model/assessmentVersion.model.js';
import { Response } from '../model/response.model.js';
import { Patient } from '../../patients/model/patient.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { ASSESSMENT_STATUS, ASSIGNMENT_STATUS } from '../../utils/constants.js';
import { Assessment } from '../../assessments/model/assessment.model.js';
import { isAnswered, rawScoreFor } from '../../scoring/scoringEngine.js';
import { calculateResult } from '../../results/service/result.service.js';
import { ACTIONS, logActivity } from '../../activity/service/activity.service.js';
import { touchPatient } from '../../patients/service/patient.service.js';

const OPEN = [ASSIGNMENT_STATUS.ASSIGNED, ASSIGNMENT_STATUS.IN_PROGRESS];

/** Ownership check: a patient can only ever load their own assignments. */
const findOwnedAssignment = async (patientId, assignmentId) => {
  const assignment = await Assignment.findOne({ _id: assignmentId, patient: patientId }).populate('assessment', 'code name');
  // 404 (not 403) so the existence of other patients' records is not revealed.
  if (!assignment || assignment.status === ASSIGNMENT_STATUS.CANCELLED) throw ApiError.notFound('Assessment not found');
  return assignment;
};

/** Patient-safe view of a snapshot: no scores, scoring rules, sensitivity markers or clinician notes. */
const toPatientSnapshot = (version) => ({
  name: version.name,
  code: version.code,
  instructions: version.instructions,
  respondent: version.respondent,
  timeframe: version.timeframe,
  version: version.version,
  sections: version.sections || [],
  questions: [...version.questions]
    .sort((a, b) => a.order - b.order)
    .map((q, i) => ({
      itemId: q.itemId,
      number: i + 1,
      sectionKey: q.sectionKey,
      text: q.text,
      helpText: q.helpText,
      type: q.type,
      required: q.required,
      options: (q.options || []).map((o) => ({ label: o.label, value: o.value, description: o.description })),
    })),
});

/**
 * Patient "Take a Quiz" list: every published assessment, with this patient's latest attempt state.
 * Patients never see scoring configuration or results here.
 */
export const listMyQuizzes = async (patientId) => {
  const assessments = await Assessment.find({ status: ASSESSMENT_STATUS.PUBLISHED, publishedVersion: { $ne: null } })
    .sort({ displayOrder: 1, name: 1 })
    .select('code name category description publishedVersion')
    .lean();
  const [versions, assignments] = await Promise.all([
    AssessmentVersion.find({ _id: { $in: assessments.map((a) => a.publishedVersion) } }).select('questions.itemId').lean(),
    Assignment.find({ patient: patientId, assessment: { $in: assessments.map((a) => a._id) }, status: { $ne: ASSIGNMENT_STATUS.CANCELLED } })
      .sort({ assignedAt: -1 })
      .select('assessment status completedAt assignedAt')
      .lean(),
  ]);
  const questionCount = new Map(versions.map((v) => [String(v._id), v.questions.length]));
  return assessments.map((a) => {
    const mine = assignments.filter((x) => String(x.assessment) === String(a._id));
    const open = mine.find((x) => OPEN.includes(x.status));
    const completed = mine.find((x) => x.status === ASSIGNMENT_STATUS.COMPLETED);
    return {
      assessmentId: a._id,
      code: a.code,
      name: a.name,
      category: a.category,
      description: a.description,
      questionCount: questionCount.get(String(a.publishedVersion)) || 0,
      state: open ? open.status : completed ? 'completed' : 'not_started',
      openAssignmentId: open?._id || null,
      completedAt: completed?.completedAt || null,
    };
  });
};

/** Returns the patient's open attempt for an assessment, creating one from the current published version if needed. */
export const startQuiz = async (patientId, assessmentId, actor) => {
  const assessment = await Assessment.findOne({ _id: assessmentId, status: ASSESSMENT_STATUS.PUBLISHED });
  if (!assessment?.publishedVersion) throw ApiError.notFound('Assessment not found');
  const open = await Assignment.findOne({ patient: patientId, assessment: assessment._id, status: { $in: OPEN } }).sort({ assignedAt: -1 });
  if (open) return { assignmentId: open._id };
  const assignment = await Assignment.create({
    patient: patientId,
    assessment: assessment._id,
    assessmentVersion: assessment.publishedVersion,
    version: assessment.currentVersion,
    assignedBy: actor._id,
    note: 'Started by the patient',
  });
  return { assignmentId: assignment._id };
};

export const listMyAssignments = async (patientId) => {
  const assignments = await Assignment.find({ patient: patientId, status: { $ne: ASSIGNMENT_STATUS.CANCELLED } })
    .sort({ assignedAt: -1 })
    .populate('assessment', 'code name description')
    .lean();
  const [responses, versions] = await Promise.all([
    Response.find({ assignment: { $in: assignments.map((a) => a._id) } }).select('assignment answers.itemId lastSavedAt').lean(),
    AssessmentVersion.find({ _id: { $in: assignments.map((a) => a.assessmentVersion) } }).select('questions.itemId name').lean(),
  ]);
  const responseMap = new Map(responses.map((r) => [String(r.assignment), r]));
  const versionMap = new Map(versions.map((v) => [String(v._id), v]));
  return assignments.map((a) => {
    const v = versionMap.get(String(a.assessmentVersion));
    const r = responseMap.get(String(a._id));
    return {
      _id: a._id,
      status: a.status,
      assignedAt: a.assignedAt,
      dueDate: a.dueDate,
      startedAt: a.startedAt,
      completedAt: a.completedAt,
      assessment: { code: a.assessment.code, name: v?.name || a.assessment.name, description: a.assessment.description },
      questionCount: v?.questions.length || 0,
      answeredCount: r?.answers.length || 0,
      lastSavedAt: r?.lastSavedAt,
    };
  });
};

export const getMyAssignment = async (patientId, assignmentId) => {
  const assignment = await findOwnedAssignment(patientId, assignmentId);
  const [version, response] = await Promise.all([
    AssessmentVersion.findById(assignment.assessmentVersion).lean(),
    Response.findOne({ assignment: assignment._id }).lean(),
  ]);
  return {
    assignment: {
      _id: assignment._id,
      status: assignment.status,
      dueDate: assignment.dueDate,
      startedAt: assignment.startedAt,
      completedAt: assignment.completedAt,
    },
    assessment: { ...toPatientSnapshot(version), description: version.description, assessmentId: assignment.assessment._id },
    answers: (response?.answers || []).map((a) => ({ itemId: a.itemId, value: a.value, values: a.values, text: a.text })),
    lastSavedAt: response?.lastSavedAt || null,
  };
};

const normaliseAnswers = (version, incoming) => {
  const byId = new Map(version.questions.map((q) => [q.itemId, q]));
  const numberOf = new Map([...version.questions].sort((a, b) => a.order - b.order).map((q, i) => [q.itemId, i + 1]));
  return incoming.map((answer) => {
    const q = byId.get(String(answer.itemId));
    if (!q) throw ApiError.badRequest('Answer references a question that is not part of this assessment');
    const clean = { itemId: q.itemId, questionNumber: numberOf.get(q.itemId), answeredAt: new Date() };
    if (q.type === 'text') {
      clean.text = String(answer.text ?? '').slice(0, 5000);
    } else if (q.type === 'multiple_choice') {
      const values = [...new Set((answer.values || []).map(String))];
      if (values.some((v) => !q.options.some((o) => o.value === v))) throw ApiError.badRequest(`Invalid answer for question ${clean.questionNumber}`);
      clean.values = values;
      clean.selectedLabel = values.map((v) => q.options.find((o) => o.value === v).label).join(', ');
    } else {
      const option = q.options.find((o) => o.value === String(answer.value));
      if (!option) throw ApiError.badRequest(`Invalid answer for question ${clean.questionNumber}`);
      clean.value = option.value;
      clean.selectedLabel = option.label;
    }
    clean.score = rawScoreFor(q, clean);
    return clean;
  });
};

export const saveProgress = async (patientId, assignmentId, incoming, actor) => {
  const assignment = await findOwnedAssignment(patientId, assignmentId);
  if (!OPEN.includes(assignment.status)) throw ApiError.conflict('This assessment has already been submitted');
  const version = await AssessmentVersion.findById(assignment.assessmentVersion).lean();
  const answers = normaliseAnswers(version, incoming);

  // Ensure the draft document exists (concurrent first saves may race on the unique index; that's fine).
  try {
    await Response.updateOne(
      { assignment: assignment._id },
      { $setOnInsert: { patient: patientId, assessmentVersion: version._id, status: 'draft', answers: [] } },
      { upsert: true },
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }

  // Each answer is written with its own atomic update, so saves fired on every click can run
  // concurrently without overwriting each other. Only draft responses are ever modified.
  const draft = { assignment: assignment._id, status: 'draft' };
  const now = new Date();
  for (const a of answers) {
    const q = version.questions.find((x) => x.itemId === a.itemId);
    let res;
    if (!isAnswered(q, a)) {
      res = await Response.updateOne(draft, { $pull: { answers: { itemId: a.itemId } }, $set: { lastSavedAt: now } });
    } else {
      res = await Response.updateOne({ ...draft, 'answers.itemId': a.itemId }, { $set: { 'answers.$': a, lastSavedAt: now } });
      if (!res.matchedCount) {
        res = await Response.updateOne({ ...draft, 'answers.itemId': { $ne: a.itemId } }, { $push: { answers: a }, $set: { lastSavedAt: now } });
        // A concurrent request inserted this item first; overwrite it instead.
        if (!res.matchedCount) res = await Response.updateOne({ ...draft, 'answers.itemId': a.itemId }, { $set: { 'answers.$': a, lastSavedAt: now } });
      }
    }
    if (!res.matchedCount) throw ApiError.conflict('This assessment has already been submitted');
  }
  const response = await Response.findOne({ assignment: assignment._id }).select('answers.itemId lastSavedAt').lean();

  if (assignment.status === ASSIGNMENT_STATUS.ASSIGNED) {
    const started = await Assignment.findOneAndUpdate(
      { _id: assignment._id, status: ASSIGNMENT_STATUS.ASSIGNED },
      { status: ASSIGNMENT_STATUS.IN_PROGRESS, startedAt: new Date() },
    );
    if (started) {
      const patient = await Patient.findById(patientId).select('fullName');
      await logActivity({
        actor,
        action: ACTIONS.ASSESSMENT_STARTED,
        category: 'assessment',
        message: `${patient.fullName} started ${assignment.assessment.code}`,
        entityType: 'Assignment',
        entityId: assignment._id,
        patient: patientId,
      });
    }
  }
  await touchPatient(patientId);
  return { answeredCount: response.answers.length, lastSavedAt: response.lastSavedAt };
};

export const submitAssessment = async (patientId, assignmentId, incoming, actor) => {
  if (incoming?.length) await saveProgress(patientId, assignmentId, incoming, actor);

  const assignment = await findOwnedAssignment(patientId, assignmentId);
  if (!OPEN.includes(assignment.status)) throw ApiError.conflict('This assessment has already been submitted');
  const [version, response] = await Promise.all([
    AssessmentVersion.findById(assignment.assessmentVersion).lean(),
    Response.findOne({ assignment: assignment._id }),
  ]);

  const answerMap = new Map((response?.answers || []).map((a) => [a.itemId, a]));
  const missing = [...version.questions]
    .sort((a, b) => a.order - b.order)
    .map((q, i) => ({ q, n: i + 1 }))
    .filter(({ q }) => q.required && !isAnswered(q, answerMap.get(q.itemId)))
    .map(({ n }) => n);
  if (missing.length) {
    throw ApiError.badRequest(`Please answer all required questions before submitting (${missing.length} remaining).`, [
      { field: 'answers', message: `Unanswered: ${missing.join(', ')}` },
    ]);
  }

  // Atomic state transition guarantees a single submission even under double-clicks or retries.
  const completedAt = new Date();
  const claimed = await Assignment.findOneAndUpdate(
    { _id: assignment._id, patient: patientId, status: { $in: OPEN } },
    { status: ASSIGNMENT_STATUS.COMPLETED, completedAt, startedAt: assignment.startedAt || completedAt },
    { new: true },
  );
  if (!claimed) throw ApiError.conflict('This assessment has already been submitted');

  await Response.updateOne({ _id: response._id }, { status: 'submitted', submittedAt: completedAt });

  const patient = await Patient.findById(patientId).select('fullName');
  await logActivity({
    actor,
    action: ACTIONS.ASSESSMENT_COMPLETED,
    category: 'assessment',
    message: `${patient.fullName} completed ${assignment.assessment.code}`,
    entityType: 'Assignment',
    entityId: assignment._id,
    patient: patientId,
  });
  await calculateResult(assignment._id, { actor });
  await touchPatient(patientId);

  return { status: claimed.status, completedAt };
};
