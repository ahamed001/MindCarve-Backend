import { Assignment } from '../../assignments/model/assignment.model.js';
import { AssessmentResult } from '../../results/model/result.model.js';
import { Response } from '../../responses/model/response.model.js';
import { AssessmentVersion } from '../../assessments/model/assessmentVersion.model.js';
import { Patient } from '../../patients/model/patient.model.js';
import { ActivityLog } from '../../activity/model/activity.model.js';
import { User } from '../../users/model/user.model.js';
import { ACTIONS } from '../../activity/service/activity.service.js';
import { ASSIGNMENT_STATUS, STAFF_ROLES } from '../../utils/constants.js';

const inPeriod = (start, end) => ({ $gte: start, $lt: end });

export const monthlySummaryData = async (start, end) => {
  const [assigned, completed, newPatients, results] = await Promise.all([
    Assignment.countDocuments({ assignedAt: inPeriod(start, end) }),
    Assignment.find({ status: ASSIGNMENT_STATUS.COMPLETED, completedAt: inPeriod(start, end) }).populate('assessment', 'code name').lean(),
    Patient.countDocuments({ createdAt: inPeriod(start, end) }),
    AssessmentResult.find({ calculatedAt: inPeriod(start, end) }).populate('assessment', 'code').lean(),
  ]);
  const byAssessment = new Map();
  completed.forEach((a) => {
    const key = a.assessment.code;
    if (!byAssessment.has(key)) byAssessment.set(key, { code: key, name: a.assessment.name, completed: 0, low: 0, moderate: 0, high: 0, other: 0 });
    byAssessment.get(key).completed += 1;
  });
  results.forEach((r) => {
    const row = byAssessment.get(r.assessment.code);
    if (!row) return;
    if (r.riskLevel) row[r.riskLevel] += 1;
    else row.other += 1;
  });
  return {
    assigned,
    completed: completed.length,
    newPatients,
    flagged: results.filter((r) => r.reviewStatus === 'flagged').length,
    reviewed: results.filter((r) => r.reviewStatus === 'reviewed').length,
    rows: [...byAssessment.values()].sort((a, b) => a.code.localeCompare(b.code)),
  };
};

export const highRiskData = async (start, end) => {
  const results = await AssessmentResult.find({
    calculatedAt: inPeriod(start, end),
    $or: [{ riskLevel: 'high' }, { reviewStatus: { $in: ['flagged'] } }],
  })
    .sort({ calculatedAt: -1 })
    .populate('patient', 'fullName patientCode')
    .populate('assessment', 'code')
    .populate('reviewedBy', 'name')
    .lean();
  return results.map((r) => ({
    date: r.calculatedAt,
    patientCode: r.patient?.patientCode,
    patientName: r.patient?.fullName,
    assessment: r.assessment?.code,
    score: r.total?.score ?? '—',
    band: r.total?.band?.label || (r.subscales || []).filter((s) => s.meetsCutoff).map((s) => s.name).join('; ') || '—',
    riskLevel: r.riskLevel || '—',
    reviewStatus: r.reviewStatus,
    reviewedBy: r.reviewedBy?.name || '',
    reviewTriggers: (r.flags || []).filter((f) => f.type === 'review_trigger').length,
  }));
};

export const responseAnalysisData = async (start, end) => {
  const responses = await Response.find({ status: 'submitted', submittedAt: inPeriod(start, end) }).select('assessmentVersion answers').lean();
  const versionIds = [...new Set(responses.map((r) => String(r.assessmentVersion)))];
  const versions = await AssessmentVersion.find({ _id: { $in: versionIds } }).lean();
  const sheets = versions.map((v) => {
    const relevant = responses.filter((r) => String(r.assessmentVersion) === String(v._id));
    const questions = [...v.questions].sort((a, b) => a.order - b.order);
    const rows = questions.map((q, i) => {
      const counts = new Map((q.options || []).map((o) => [o.value, 0]));
      let answered = 0;
      relevant.forEach((r) => {
        const a = r.answers.find((x) => x.itemId === q.itemId);
        if (!a) return;
        answered += 1;
        (a.values?.length ? a.values : [a.value]).forEach((val) => counts.set(val, (counts.get(val) || 0) + 1));
      });
      return {
        number: i + 1,
        text: q.text,
        answered,
        options: (q.options || []).map((o) => ({ label: o.label, count: counts.get(o.value) || 0, pct: answered ? (counts.get(o.value) || 0) / answered : 0 })),
      };
    });
    return { name: `${v.code} v${v.version}`, title: v.name, submissions: relevant.length, rows };
  });
  return sheets.sort((a, b) => a.name.localeCompare(b.name));
};

export const workloadData = async (start, end) => {
  const staff = await User.find({ role: { $in: STAFF_ROLES } }).select('name email role').lean();
  const tracked = [ACTIONS.PATIENT_REGISTERED, ACTIONS.ASSESSMENT_ASSIGNED, ACTIONS.NOTE_ADDED, ACTIONS.REVIEW_COMPLETED, ACTIONS.QUESTION_UPDATED];
  const rows = await ActivityLog.aggregate([
    { $match: { createdAt: inPeriod(start, end), action: { $in: tracked }, actor: { $in: staff.map((s) => s._id) } } },
    { $group: { _id: { actor: '$actor', action: '$action' }, count: { $sum: 1 } } },
  ]);
  return staff.map((s) => {
    const get = (action) => rows.find((r) => String(r._id.actor) === String(s._id) && r._id.action === action)?.count || 0;
    const row = {
      name: s.name,
      email: s.email,
      role: s.role,
      patientsRegistered: get(ACTIONS.PATIENT_REGISTERED),
      assessmentsAssigned: get(ACTIONS.ASSESSMENT_ASSIGNED),
      notesAdded: get(ACTIONS.NOTE_ADDED),
      reviewsCompleted: get(ACTIONS.REVIEW_COMPLETED),
      contentEdits: get(ACTIONS.QUESTION_UPDATED),
    };
    row.total = row.patientsRegistered + row.assessmentsAssigned + row.notesAdded + row.reviewsCompleted + row.contentEdits;
    return row;
  });
};
