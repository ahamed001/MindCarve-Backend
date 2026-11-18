import { AuditLog } from '../model/auditLog.model.js';
import { Patient } from '../../patients/model/patient.model.js';
import { Assignment } from '../../assignments/model/assignment.model.js';
import { env } from '../../config/env.js';
import { buildPageMeta, escapeRegex, parsePagination } from '../../utils/pagination.js';

/** Human-readable descriptions for each audited action (also used by the admin UI filter). */
export const AUDIT_ACTIONS = {
  'auth.login': 'Signed in',
  'auth.login_failed': 'Failed sign-in attempt',
  'auth.logout': 'Signed out',
  'auth.self_registered': 'Patient self-registered',
  'auth.invitation_accepted': 'Set up account from invitation',
  'auth.password_reset_requested': 'Requested a password reset',
  'auth.password_reset': 'Reset password',
  'patient.created': 'Registered a patient',
  'patient.viewed': 'Viewed patient record',
  'patient.updated': 'Updated patient profile',
  'patient.status_changed': 'Changed patient status',
  'patient.invitation_resent': 'Resent patient invitation',
  'patient.report_printed': 'Opened printable patient report',
  'patient.note_added': 'Added a note to the patient',
  'assessment.started': 'Started / resumed an assessment',
  'assessment.submitted': 'Submitted an assessment',
  'result.viewed': 'Viewed assessment answers and scores',
  'result.review_updated': 'Updated clinical review status',
  'report.generated': 'Generated a report',
  'report.downloaded': 'Downloaded a report',
};

const clientIp = (req) => (req?.ip || req?.socket?.remoteAddress || '').replace(/^::ffff:/, '') || undefined;

/**
 * Records one audit entry. Never throws: auditing must not break the request it describes.
 * Patient name / ID are resolved from a patient id, an assignment id or a Patient ID (code).
 */
export const recordAudit = async ({ req, actor, action, outcome = 'success', patientId, assignmentId, patientCode, entityType, entityId, details, actorEmail }) => {
  try {
    const user = actor || req?.user;
    let patient = null;
    if (!patientId && assignmentId) patientId = (await Assignment.findById(assignmentId).select('patient').lean())?.patient;
    if (patientId) patient = await Patient.findById(patientId).select('fullName patientCode').lean();
    else if (patientCode) patient = await Patient.findOne({ patientCode }).select('fullName patientCode').lean();
    await AuditLog.create({
      action,
      outcome,
      actor: user?._id,
      actorName: user?.name,
      actorEmail: user?.email || actorEmail,
      actorRole: user?.role,
      patient: patient?._id,
      patientName: patient?.fullName,
      patientCode: patient?.patientCode,
      entityType,
      entityId,
      details,
      ip: clientIp(req),
      userAgent: req?.get?.('user-agent')?.slice(0, 300),
    });
  } catch (error) {
    if (!env.isTest) console.error('[audit] failed to record', action, error.message);
  }
};

export const listAudit = async (query) => {
  const { page, limit, skip } = parsePagination(query, 25);
  const filter = {};
  if (query.action) filter.action = query.action;
  if (query.outcome) filter.outcome = query.outcome;
  if (query.patient) filter.patient = query.patient;
  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search.trim()), 'i');
    filter.$or = [{ actorName: rx }, { actorEmail: rx }, { patientName: rx }, { patientCode: rx }, { details: rx }];
  }
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = new Date(query.to);
  }
  const [items, total] = await Promise.all([AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(), AuditLog.countDocuments(filter)]);
  return {
    items: items.map((i) => ({ ...i, actionLabel: AUDIT_ACTIONS[i.action] || i.action })),
    pagination: buildPageMeta(total, page, limit),
    actions: Object.entries(AUDIT_ACTIONS).map(([value, label]) => ({ value, label })),
  };
};
