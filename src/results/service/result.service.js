import { AssessmentResult } from '../model/result.model.js';
import { Assignment } from '../../assignments/model/assignment.model.js';
import { AssessmentVersion } from '../../assessments/model/assessmentVersion.model.js';
import { Response } from '../../responses/model/response.model.js';
import { scoreAssessment } from '../../scoring/scoringEngine.js';
import { ApiError } from '../../utils/ApiError.js';
import { ACTIONS, logActivity } from '../../activity/service/activity.service.js';

/** Calculates (or recalculates) a result from the assignment's immutable version snapshot and stored answers. */
export const calculateResult = async (assignmentId, { actor, isDemo = false, calculatedAt } = {}) => {
  const assignment = await Assignment.findById(assignmentId).populate('patient', 'fullName').populate('assessment', 'code');
  if (!assignment) throw ApiError.notFound('Assignment not found');
  const response = await Response.findOne({ assignment: assignmentId, status: 'submitted' }).lean();
  if (!response) throw ApiError.badRequest('This assessment has not been submitted');
  const version = await AssessmentVersion.findById(assignment.assessmentVersion).lean();

  let outcome;
  try {
    outcome = scoreAssessment(version, response.answers);
  } catch (error) {
    outcome = { status: 'not_configured', total: null, subscales: [], outputs: [], riskLevel: null, flags: [], notes: [`Scoring configuration error: ${error.message}`] };
  }

  const reviewTriggered = outcome.riskLevel === 'high' || outcome.flags.some((f) => f.type === 'review_trigger');
  const existing = await AssessmentResult.findOne({ assignment: assignmentId });

  const doc = {
    assignment: assignment._id,
    patient: assignment.patient._id,
    assessment: assignment.assessment._id,
    assessmentVersion: assignment.assessmentVersion,
    version: assignment.version,
    status: outcome.status,
    total: outcome.total,
    subscales: outcome.subscales,
    outputs: outcome.outputs,
    riskLevel: outcome.riskLevel,
    flags: outcome.flags,
    itemScores: outcome.itemScores || null,
    notes: outcome.notes,
    calculatedAt: calculatedAt || new Date(),
    isDemo,
  };
  if (!existing || existing.reviewStatus === 'none') doc.reviewStatus = reviewTriggered ? 'flagged' : 'none';

  const result = await AssessmentResult.findOneAndUpdate({ assignment: assignmentId }, doc, { upsert: true, new: true, setDefaultsOnInsert: true });

  if (reviewTriggered && (!existing || existing.reviewStatus === 'none')) {
    await logActivity({
      actor,
      action: ACTIONS.FLAGGED_FOR_REVIEW,
      category: 'clinical',
      message: `${assignment.patient.fullName} flagged for clinical review (${assignment.assessment.code})`,
      entityType: 'AssessmentResult',
      entityId: result._id,
      patient: assignment.patient._id,
      metadata: { riskLevel: outcome.riskLevel, reviewTriggers: outcome.flags.filter((f) => f.type === 'review_trigger').length },
      isDemo,
      createdAt: calculatedAt,
    });
  }
  return result.toObject();
};

export const getResultByAssignment = async (assignmentId) => {
  const result = await AssessmentResult.findOne({ assignment: assignmentId }).populate('reviewedBy', 'name').lean();
  if (!result) throw ApiError.notFound('No result for this assignment yet');
  return result;
};

export const getSubscaleResults = async (assignmentId) => {
  const result = await getResultByAssignment(assignmentId);
  return { status: result.status, subscales: result.subscales };
};

export const getPatientResultHistory = (patientId) =>
  AssessmentResult.find({ patient: patientId }).sort({ calculatedAt: -1 }).populate('assessment', 'code name').lean();

export const updateReviewStatus = async (resultId, reviewStatus, actor) => {
  const result = await AssessmentResult.findById(resultId).populate('patient', 'fullName').populate('assessment', 'code');
  if (!result) throw ApiError.notFound('Result not found');
  result.reviewStatus = reviewStatus;
  if (reviewStatus === 'reviewed') {
    result.reviewedBy = actor._id;
    result.reviewedAt = new Date();
  }
  await result.save();
  await logActivity({
    actor,
    action: reviewStatus === 'reviewed' ? ACTIONS.REVIEW_COMPLETED : ACTIONS.FLAGGED_FOR_REVIEW,
    category: 'clinical',
    message:
      reviewStatus === 'reviewed'
        ? `${actor.name} completed clinical review for ${result.patient.fullName} (${result.assessment.code})`
        : `${result.patient.fullName} flagged for clinical review by ${actor.name} (${result.assessment.code})`,
    entityType: 'AssessmentResult',
    entityId: result._id,
    patient: result.patient._id,
  });
  return result.toObject();
};
