import { ActivityLog } from '../model/activity.model.js';
import { buildPageMeta, parsePagination } from '../../utils/pagination.js';

export const ACTIONS = Object.freeze({
  PATIENT_REGISTERED: 'patient.registered',
  PATIENT_UPDATED: 'patient.updated',
  PATIENT_STATUS_CHANGED: 'patient.status_changed',
  INVITATION_SENT: 'patient.invitation_sent',
  INVITATION_ACCEPTED: 'patient.invitation_accepted',
  ASSESSMENT_ASSIGNED: 'assessment.assigned',
  ASSIGNMENT_CANCELLED: 'assessment.assignment_cancelled',
  ASSESSMENT_STARTED: 'assessment.started',
  ASSESSMENT_COMPLETED: 'assessment.completed',
  FLAGGED_FOR_REVIEW: 'clinical.flagged_for_review',
  REVIEW_COMPLETED: 'clinical.review_completed',
  NOTE_ADDED: 'clinical.note_added',
  ASSESSMENT_CREATED: 'content.assessment_created',
  ASSESSMENT_UPDATED: 'content.assessment_updated',
  QUESTION_UPDATED: 'content.question_updated',
  ASSESSMENT_PUBLISHED: 'content.assessment_published',
  ASSESSMENT_ARCHIVED: 'content.assessment_archived',
  REPORT_GENERATED: 'system.report_generated',
});

export const logActivity = async ({ actor, action, category, message, entityType, entityId, patient, metadata, isDemo, createdAt }) => {
  const doc = {
    actor: actor?._id || actor || undefined,
    actorName: actor?.name,
    actorRole: actor?.role,
    action,
    category,
    message,
    entityType,
    entityId,
    patient: patient?._id || patient || undefined,
    metadata,
    isDemo: Boolean(isDemo),
  };
  if (createdAt) doc.createdAt = createdAt;
  return ActivityLog.create(doc);
};

export const listActivity = async (query) => {
  const { page, limit, skip } = parsePagination(query, 20);
  const filter = {};
  if (query.category) filter.category = query.category;
  if (query.patient) filter.patient = query.patient;
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = new Date(query.to);
  }
  const [items, total] = await Promise.all([
    ActivityLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('patient', 'fullName patientCode').lean(),
    ActivityLog.countDocuments(filter),
  ]);
  return { items, pagination: buildPageMeta(total, page, limit) };
};
