import { Patient } from '../model/patient.model.js';
import { ageInYears } from '../../utils/age.js';
import { Assessment } from '../../assessments/model/assessment.model.js';
import { User } from '../../users/model/user.model.js';
import { Assignment } from '../../assignments/model/assignment.model.js';
import { ClinicianNote } from '../../notes/model/note.model.js';
import { ActivityLog } from '../../activity/model/activity.model.js';
import { nextSequence } from '../../utils/counter.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { ASSESSMENT_STATUS, ASSIGNMENT_STATUS, ROLES } from '../../utils/constants.js';
import { buildPageMeta, escapeRegex, parsePagination } from '../../utils/pagination.js';
import { issueToken, latestInvitationFor } from '../../auth/service/invitation.service.js';
import { assignAssessments, getAttemptReport, getPatientAssignments } from '../../assignments/service/assignment.service.js';
import { ACTIONS, logActivity } from '../../activity/service/activity.service.js';

export { ageInYears } from '../../utils/age.js';

const PROFILE_FIELDS = [
  'fullName',
  'phone',
  'dateOfBirth',
  'age',
  'gender',
  'guardianName',
  'relevantInfo',
  'address',
  'city',
  'state',
  'pincode',
  'location',
  'maritalStatus',
  'education',
  'occupation',
  'referredBy',
];

const assignmentSummary = async (patientIds) => {
  const rows = await Assignment.aggregate([
    { $match: { patient: { $in: patientIds }, status: { $ne: ASSIGNMENT_STATUS.CANCELLED } } },
    {
      $group: {
        _id: '$patient',
        total: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status', ASSIGNMENT_STATUS.COMPLETED] }, 1, 0] } },
        assessments: { $addToSet: '$assessment' },
      },
    },
    { $lookup: { from: 'assessments', localField: 'assessments', foreignField: '_id', as: 'assessmentDocs' } },
    { $project: { total: 1, completed: 1, codes: '$assessmentDocs.code' } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r]));
};

const completionPatientIds = async (completion) => {
  const rows = await Assignment.aggregate([
    { $match: { status: { $ne: ASSIGNMENT_STATUS.CANCELLED } } },
    { $group: { _id: '$patient', pending: { $sum: { $cond: [{ $ne: ['$status', ASSIGNMENT_STATUS.COMPLETED] }, 1, 0] } } } },
  ]);
  if (completion === 'pending') return { $in: rows.filter((r) => r.pending > 0).map((r) => r._id) };
  if (completion === 'completed') return { $in: rows.filter((r) => r.pending === 0).map((r) => r._id) };
  if (completion === 'none') return { $nin: rows.map((r) => r._id) };
  return null;
};

export const listPatients = async (query) => {
  const { page, limit, skip } = parsePagination(query, 10);
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.gender) filter.gender = query.gender;
  if (query.declaration === 'signed') filter['declaration.accepted'] = true;
  if (query.declaration === 'pending') filter['declaration.accepted'] = { $ne: true };
  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search.trim()), 'i');
    filter.$or = [{ fullName: rx }, { email: rx }, { patientCode: rx }, { phone: rx }, { city: rx }];
  }
  if (query.completion) {
    const idFilter = await completionPatientIds(query.completion);
    if (idFilter) filter._id = idFilter;
  }

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [patients, total, registered, declarationSigned, joinedLast7Days] = await Promise.all([
    Patient.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('user', 'status').lean(),
    Patient.countDocuments(filter),
    Patient.countDocuments({}),
    Patient.countDocuments({ 'declaration.accepted': true }),
    Patient.countDocuments({ createdAt: { $gte: weekAgo } }),
  ]);
  const summary = await assignmentSummary(patients.map((p) => p._id));
  const items = patients.map((p) => {
    const s = summary.get(String(p._id));
    return {
      ...p,
      accountStatus: p.user?.status,
      user: undefined,
      assignments: { total: s?.total || 0, completed: s?.completed || 0, codes: s?.codes || [] },
    };
  });
  return { items, pagination: buildPageMeta(total, page, limit), stats: { registered, declarationSigned, joinedLast7Days } };
};

export const createPatient = async (data, actor) => {
  const email = data.email.toLowerCase().trim();
  if (await User.exists({ email })) throw ApiError.conflict('An account with this email already exists');

  const user = await User.create({ name: data.fullName, email, role: ROLES.PATIENT, status: 'invited' });
  let patient;
  try {
    const seq = await nextSequence('patientCode');
    patient = await Patient.create({
      ...Object.fromEntries(PROFILE_FIELDS.filter((f) => data[f] !== undefined).map((f) => [f, data[f]])),
      patientCode: `ATH-${String(seq).padStart(4, '0')}`,
      email,
      user: user._id,
      createdBy: actor._id,
      lastActivityAt: new Date(),
    });
    user.patient = patient._id;
    await user.save();
  } catch (error) {
    await User.deleteOne({ _id: user._id });
    throw error;
  }

  await logActivity({
    actor,
    action: ACTIONS.PATIENT_REGISTERED,
    category: 'patient',
    message: `New patient registered: ${patient.fullName}`,
    entityType: 'Patient',
    entityId: patient._id,
    patient: patient._id,
  });

  let assignmentResult = { created: [], skipped: [] };
  if (data.assessmentIds?.length) {
    assignmentResult = await assignAssessments(patient._id, data.assessmentIds, { dueDate: data.dueDate }, actor);
  }

  const { invitation, devLink } = await issueToken({ user, patient, purpose: 'invitation', createdBy: actor });
  await logActivity({
    actor,
    action: ACTIONS.INVITATION_SENT,
    category: 'patient',
    message: `Invitation ${invitation.emailStatus === 'failed' ? 'could not be sent' : 'sent'} to ${patient.fullName}`,
    entityType: 'Patient',
    entityId: patient._id,
    patient: patient._id,
  });

  return {
    patient: patient.toObject(),
    invitation,
    assignments: { created: assignmentResult.created.length, skipped: assignmentResult.skipped },
    ...(devLink ? { devInviteLink: devLink } : {}),
  };
};

export const getPatientOr404 = async (id) => {
  const patient = await Patient.findById(id);
  if (!patient) throw ApiError.notFound('Patient not found');
  return patient;
};

/**
 * Combined printable report for a patient: every published assessment the patient has started
 * (completed or in progress), in quiz order, each with its server-calculated scores and answers.
 */
export const getPatientReport = async (id) => {
  const { patient, assessments } = await getPatientDetail(id);
  const withAttempts = assessments.filter((a) => a.attempt);
  const sections = [];
  for (const row of withAttempts) {
    const report = await getAttemptReport(row.attempt._id);
    sections.push({ state: row.state, assignment: report.assignment, assessment: report.assessment, summary: report.summary, questions: report.questions, score: report.score });
  }
  return {
    patient: {
      _id: patient._id,
      patientCode: patient.patientCode,
      fullName: patient.fullName,
      email: patient.email,
      phone: patient.phone,
      gender: patient.gender,
      ageYears: patient.ageYears,
      address: [patient.address, patient.city, patient.state, patient.pincode].filter(Boolean).join(', '),
      registeredOn: patient.createdAt,
    },
    generatedAt: new Date(),
    sections,
    notStarted: assessments.filter((a) => !a.attempt).map((a) => a.name),
  };
};

export const getPatientDetail = async (id) => {
  const patient = await Patient.findById(id).populate('user', 'status lastLoginAt').populate('createdBy', 'name').lean();
  if (!patient) throw ApiError.notFound('Patient not found');
  const [assignments, notes, activity, invitation, published] = await Promise.all([
    getPatientAssignments(id),
    ClinicianNote.find({ patient: id }).sort({ createdAt: -1 }).populate('author', 'name role').lean(),
    ActivityLog.find({ patient: id }).sort({ createdAt: -1 }).limit(25).lean(),
    latestInvitationFor(patient.user._id),
    Assessment.find({ status: ASSESSMENT_STATUS.PUBLISHED }).sort({ displayOrder: 1, name: 1 }).select('code name').lean(),
  ]);

  // One row per published assessment: the open attempt if there is one, otherwise the latest completed one.
  const active = assignments.filter((a) => a.status !== ASSIGNMENT_STATUS.CANCELLED);
  const assessments = published.map((assessment) => {
    const mine = active.filter((a) => String(a.assessment?._id) === String(assessment._id));
    const attempt = mine.find((a) => a.status !== ASSIGNMENT_STATUS.COMPLETED) || mine.find((a) => a.status === ASSIGNMENT_STATUS.COMPLETED) || null;
    const state = !attempt ? 'not_started' : attempt.status === ASSIGNMENT_STATUS.COMPLETED ? 'completed' : attempt.progress.answeredCount > 0 ? 'in_progress' : 'not_started';
    return { assessmentId: assessment._id, code: assessment.code, name: assessment.name, state, attempt };
  });
  return {
    patient: { ...patient, ageYears: ageInYears(patient), accountStatus: patient.user?.status, lastLoginAt: patient.user?.lastLoginAt },
    invitation: invitation
      ? { emailStatus: invitation.emailStatus, sentAt: invitation.sentAt, expiresAt: invitation.expiresAt, usedAt: invitation.usedAt, revokedAt: invitation.revokedAt }
      : null,
    assignments,
    assessments,
    completedCount: assessments.filter((a) => a.state === 'completed').length,
    notes,
    activity,
  };
};

export const updatePatient = async (id, data, actor) => {
  const patient = await getPatientOr404(id);
  PROFILE_FIELDS.forEach((f) => {
    if (data[f] !== undefined) patient[f] = data[f];
  });

  if (data.email && data.email.toLowerCase() !== patient.email) {
    const email = data.email.toLowerCase().trim();
    if (await User.exists({ email, _id: { $ne: patient.user } })) throw ApiError.conflict('An account with this email already exists');
    patient.email = email;
    await User.updateOne({ _id: patient.user }, { email });
  }
  await patient.save();
  if (data.fullName) await User.updateOne({ _id: patient.user }, { name: patient.fullName });

  await logActivity({
    actor,
    action: ACTIONS.PATIENT_UPDATED,
    category: 'patient',
    message: `${actor.name} updated ${patient.fullName}'s profile`,
    entityType: 'Patient',
    entityId: patient._id,
    patient: patient._id,
  });
  return getPatientDetail(id);
};

export const setPatientStatus = async (id, status, actor) => {
  const patient = await getPatientOr404(id);
  patient.status = status;
  await patient.save();
  const user = await User.findById(patient.user).select('+tokenVersion +passwordHash');
  if (status === 'inactive') {
    user.tokenVersion += 1; // end any active sessions
    user.status = 'disabled';
  } else {
    user.status = user.passwordHash ? 'active' : 'invited';
  }
  await user.save();

  await logActivity({
    actor,
    action: ACTIONS.PATIENT_STATUS_CHANGED,
    category: 'patient',
    message: `${patient.fullName} marked ${status}`,
    entityType: 'Patient',
    entityId: patient._id,
    patient: patient._id,
  });
  return getPatientDetail(id);
};

export const resendInvitation = async (id, actor) => {
  const patient = await getPatientOr404(id);
  const user = await User.findById(patient.user);
  if (user.status !== 'invited') throw ApiError.badRequest('This patient has already set up their account');
  if (patient.status !== 'active') throw ApiError.badRequest('Reactivate the patient before resending an invitation');
  const { invitation, devLink } = await issueToken({ user, patient, purpose: 'invitation', createdBy: actor });
  await logActivity({
    actor,
    action: ACTIONS.INVITATION_SENT,
    category: 'patient',
    message: `Invitation resent to ${patient.fullName}`,
    entityType: 'Patient',
    entityId: patient._id,
    patient: patient._id,
  });
  return { invitation, ...(devLink ? { devInviteLink: devLink } : {}) };
};

export const touchPatient = (patientId) => Patient.updateOne({ _id: patientId }, { lastActivityAt: new Date() });
