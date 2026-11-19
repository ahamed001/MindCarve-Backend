import { Assignment } from '../model/assignment.model.js';
import { Assessment } from '../../assessments/model/assessment.model.js';
import { AssessmentVersion } from '../../assessments/model/assessmentVersion.model.js';
import { Patient } from '../../patients/model/patient.model.js';
import { Response } from '../../responses/model/response.model.js';
import { AssessmentResult } from '../../results/model/result.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { ASSESSMENT_STATUS, ASSIGNMENT_STATUS } from '../../utils/constants.js';
import { buildPageMeta, parsePagination } from '../../utils/pagination.js';
import { ACTIONS, logActivity } from '../../activity/service/activity.service.js';
import { isAnswered } from '../../scoring/scoringEngine.js';
import { ageInYears } from '../../utils/age.js';

const ACTIVE = [ASSIGNMENT_STATUS.ASSIGNED, ASSIGNMENT_STATUS.IN_PROGRESS];

/** Assigns the currently published version of each assessment. Skips assessments already active for the patient. */
export const assignAssessments = async (patientId, assessmentIds, { dueDate, note } = {}, actor) => {
  const patient = await Patient.findById(patientId);
  if (!patient) throw ApiError.notFound('Patient not found');
  if (patient.status !== 'active') throw ApiError.badRequest('Cannot assign assessments to an inactive patient');

  const assessments = await Assessment.find({ _id: { $in: assessmentIds } });
  if (assessments.length !== new Set(assessmentIds.map(String)).size) throw ApiError.badRequest('One or more assessments were not found');

  const created = [];
  const skipped = [];
  for (const assessment of assessments) {
    if (assessment.status !== ASSESSMENT_STATUS.PUBLISHED || !assessment.publishedVersion) {
      skipped.push({ code: assessment.code, reason: 'Not published' });
      continue;
    }
    const active = await Assignment.exists({ patient: patientId, assessment: assessment._id, status: { $in: ACTIVE } });
    if (active) {
      skipped.push({ code: assessment.code, reason: 'Already assigned and not yet completed' });
      continue;
    }
    const assignment = await Assignment.create({
      patient: patientId,
      assessment: assessment._id,
      assessmentVersion: assessment.publishedVersion,
      version: assessment.currentVersion,
      assignedBy: actor?._id,
      dueDate: dueDate || undefined,
      note,
    });
    created.push(assignment);
    await logActivity({
      actor,
      action: ACTIONS.ASSESSMENT_ASSIGNED,
      category: 'assessment',
      message: `${assessment.code} assigned to ${patient.fullName}`,
      entityType: 'Assignment',
      entityId: assignment._id,
      patient: patient._id,
    });
  }
  return { created, skipped };
};

export const listAssignments = async (query) => {
  const { page, limit, skip } = parsePagination(query, 20);
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.patient) filter.patient = query.patient;
  if (query.assessment) filter.assessment = query.assessment;
  const [items, total] = await Promise.all([
    Assignment.find(filter)
      .sort({ assignedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('patient', 'fullName patientCode')
      .populate('assessment', 'code name')
      .lean(),
    Assignment.countDocuments(filter),
  ]);
  return { items, pagination: buildPageMeta(total, page, limit) };
};

export const getPatientAssignments = async (patientId) => {
  const assignments = await Assignment.find({ patient: patientId })
    .sort({ assignedAt: -1 })
    .populate('assessment', 'code name')
    .populate('assignedBy', 'name')
    .lean();
  const results = await AssessmentResult.find({ assignment: { $in: assignments.map((a) => a._id) } })
    .select('assignment status total riskLevel reviewStatus calculatedAt')
    .lean();
  const resultMap = new Map(results.map((r) => [String(r.assignment), r]));
  const [responses, versions] = await Promise.all([
    Response.find({ assignment: { $in: assignments.map((a) => a._id) } }).select('assignment answers.itemId').lean(),
    AssessmentVersion.find({ _id: { $in: [...new Set(assignments.map((a) => String(a.assessmentVersion)))] } }).select('questions.itemId').lean(),
  ]);
  const answeredMap = new Map(responses.map((r) => [String(r.assignment), r.answers.length]));
  const questionMap = new Map(versions.map((v) => [String(v._id), v.questions.length]));
  return assignments.map((a) => {
    const questionCount = questionMap.get(String(a.assessmentVersion)) || 0;
    const answeredCount = answeredMap.get(String(a._id)) || 0;
    return {
      ...a,
      result: resultMap.get(String(a._id)) || null,
      progress: { questionCount, answeredCount, percentAnswered: questionCount ? Math.round((answeredCount / questionCount) * 100) : 0 },
    };
  });
};

// ---------------------------------------------------------------- score display (server-side)
//
// The report tells the frontend exactly what to draw for each instrument; the browser does no maths.
// Card "kind", chosen from what the source configuration actually provides:
//   'cutoff' – subscales have cutoffs (SCARED): two segments, Not indicated | Indicated
//   'bands'  – subscales have source bands (BFI): Low | Average | High, label = the band's own label
//   'score'  – no subscale bands/cutoffs but the total has bands (ISAA domains): score only
//   'range'  – no norms at all (BEIS, MHI): Low | Mid | High = position within the possible range
// Tones: 'low' | 'mid' | 'high' (3-segment), 'ok' | 'alert' (cutoff / clinical risk), 'warn', 'neutral'.

const SEGMENTS = {
  // Screening results only — never presented as a diagnosis.
  cutoff: [
    { key: 'below', label: 'Below cutoff', chipLabel: 'Below screening cutoff' },
    { key: 'meets', label: 'Meets cutoff', chipLabel: 'Meets screening cutoff' },
  ],
  bands: [
    { key: 'low', label: 'Low' },
    { key: 'mid', label: 'Average' },
    { key: 'high', label: 'High' },
  ],
  range: [
    { key: 'low', label: 'Low' },
    { key: 'mid', label: 'Mid' },
    { key: 'high', label: 'High' },
  ],
  score: [],
};
const RANGE_LABEL = { low: 'Low', mid: 'Mid', high: 'High' };

/** Position of a band within its band list (lowest → highest), split into thirds. */
const bandPosition = (bands = [], label) => {
  const sorted = [...bands].sort((x, y) => (x.min ?? -Infinity) - (y.min ?? -Infinity));
  const rank = sorted.findIndex((b) => b.label === label);
  if (rank < 0 || sorted.length < 2) return null;
  const pct = rank / (sorted.length - 1);
  return pct < 1 / 3 ? 'low' : pct >= 2 / 3 ? 'high' : 'mid';
};

const RISK_TONE = { high: 'alert', moderate: 'warn', low: 'ok' };
const OPERATOR_SYMBOL = { gte: '≥', gt: '>' };
const cutoffText = (cutoff) => `score ${OPERATOR_SYMBOL[cutoff.operator || 'gte'] || '≥'} ${cutoff.value}`;

/** Screening-cutoff wording for a subscale or total: "Meets screening cutoff" / "Below screening cutoff". */
const describeCutoff = (item, sourceText) => {
  const rule = cutoffText(item.cutoff);
  return item.meetsCutoff
    ? { position: 'meets', label: 'Meets screening cutoff', tone: 'alert', detail: `Cutoff ${rule}${sourceText ? ` — ${sourceText}` : ''}`, source: 'cutoff' }
    : { position: 'below', label: 'Below screening cutoff', tone: 'ok', detail: `Cutoff ${rule}`, source: 'cutoff' };
};

const describeSubscale = (s, kind, config) => {
  if (s.score === null || s.score === undefined) return { position: null, label: null, tone: 'neutral' };
  if (kind === 'cutoff' && s.cutoff) return describeCutoff(s, s.cutoff.label);
  if (kind === 'bands' && s.band) {
    const position = bandPosition(config?.bands, s.band.label) ?? s.position;
    return { position, label: s.band.label, tone: position, detail: s.band.description };
  }
  if (kind === 'score') return { position: null, label: null, tone: 'neutral' };
  return { position: s.position, label: RANGE_LABEL[s.position] || null, tone: s.position || 'neutral' };
};

const describeTotal = (total, outputs, totalConfig) => {
  if (!total || total.score === null || total.score === undefined) return null;
  // A configured total cutoff (e.g. SCARED total ≥ 25) is reported as a screening result.
  if (total.cutoff) return describeCutoff(total, total.band?.label);
  if (total.band) {
    // Append configured outputs (e.g. ISAA disability %) to the band label: "Moderate Autism (70%)".
    const extra = (outputs || []).filter((o) => o.value !== null && o.value !== undefined).map((o) => o.label);
    const label = extra.length ? `${total.band.label} (${extra.join(', ')})` : total.band.label;
    const tone = RISK_TONE[total.band.riskLevel] || bandPosition(totalConfig?.bands, total.band.label) || 'neutral';
    return { position: bandPosition(totalConfig?.bands, total.band.label), label, tone, source: 'band' };
  }
  return { position: total.position, label: RANGE_LABEL[total.position] || null, tone: total.position || 'neutral', source: 'range' };
};

const cardKind = (scoring) => {
  const subs = scoring?.subscales || [];
  if (!subs.length) return null;
  if (subs.some((s) => s.cutoff && s.cutoff.value !== undefined && s.cutoff.value !== null)) return 'cutoff';
  if (subs.some((s) => s.bands?.length)) return 'bands';
  if (scoring?.total?.bands?.length) return 'score';
  return 'range';
};

/** Everything the staff patient view needs for one attempt, fully calculated on the server. */
export const getAttemptReport = async (assignmentId) => {
  const assignment = await Assignment.findById(assignmentId)
    .populate('assessment', 'code name')
    .populate('patient', 'patientCode fullName email phone dateOfBirth age gender address city state pincode createdAt')
    .lean();
  if (!assignment) throw ApiError.notFound('Assignment not found');
  const [version, response, result] = await Promise.all([
    AssessmentVersion.findById(assignment.assessmentVersion).lean(),
    Response.findOne({ assignment: assignmentId }).lean(),
    AssessmentResult.findOne({ assignment: assignmentId }).lean(),
  ]);

  const answers = new Map((response?.answers || []).map((a) => [a.itemId, a]));
  const questions = [...version.questions]
    .sort((a, b) => a.order - b.order)
    .map((q, i) => {
      const a = answers.get(q.itemId);
      const answered = isAnswered(q, a);
      const scored = result?.itemScores?.[q.itemId];
      return {
        number: i + 1,
        itemId: q.itemId,
        text: q.text,
        helpText: q.helpText,
        answered,
        answerLabel: answered ? a.selectedLabel || a.text : null,
        // Score shown per answer: the engine's item score (after any reverse scoring); none for unscored items.
        score: scored ? scored.score : null,
        reversed: Boolean(scored?.reversed),
      };
    });
  const answeredCount = questions.filter((q) => q.answered).length;

  let score = null;
  if (result) {
    const scoring = version.scoring || {};
    const kind = cardKind(scoring);
    const segments = SEGMENTS[kind] || [];
    const subscales = (result.subscales || []).map((sub) => {
      const config = (scoring.subscales || []).find((x) => x.key === sub.key);
      return {
        key: sub.key,
        name: sub.name,
        score: sub.score,
        min: sub.min ?? null,
        max: sub.max ?? null,
        level: describeSubscale(sub, kind, config),
      };
    });
    // Chip counts per segment, in display order (highest concern first for cutoffs, high → low otherwise).
    const chips = [...segments]
      .reverse()
      .map((seg) => ({ key: seg.key, label: seg.chipLabel || seg.label, count: subscales.filter((x) => x.level.position === seg.key).length, tone: kind === 'cutoff' ? (seg.key === 'meets' ? 'alert' : 'ok') : seg.key }))
      .filter((chip) => chip.count > 0);
    score = {
      status: result.status,
      riskLevel: result.riskLevel,
      reviewStatus: result.reviewStatus,
      kind,
      groupLabel: scoring.subscaleLabel || 'Sub-scales',
      segments: segments.map(({ key, label }) => ({ key, label })),
      chips: kind === 'score' ? [] : chips,
      // Extra source tables (e.g. ISAA "Percentage of Disability"). Values outside the table stay null.
      outputs: (result.outputs || []).map((o) => {
        const config = (scoring.outputs || []).find((x) => x.key === o.key);
        return { key: o.key, name: o.name, value: o.value ?? null, label: o.value === null || o.value === undefined ? config?.unmatchedLabel || 'Not specified in reference' : o.label, note: o.note };
      }),
      total: result.total
        ? {
            label: result.total.label,
            score: result.total.score,
            min: result.total.min ?? null,
            max: result.total.max ?? null,
            level: describeTotal(result.total, result.outputs, scoring.total),
          }
        : null,
      subscales,
      rangeNote:
        kind === 'range' || (result.total && !result.total.band && result.total.position)
          ? 'Low / Mid / High shows where a score falls within its possible range. No population norms were supplied for this scale, so these are not clinical categories.'
          : null,
      notes: result.notes || [],
    };
  }

  return {
    assignment: {
      _id: assignment._id,
      status: assignment.status,
      startedAt: assignment.startedAt,
      completedAt: assignment.completedAt,
      version: assignment.version,
    },
    assessment: { code: assignment.assessment.code, name: version.name },
    patient: assignment.patient
      ? {
          _id: assignment.patient._id,
          patientCode: assignment.patient.patientCode,
          fullName: assignment.patient.fullName,
          email: assignment.patient.email,
          phone: assignment.patient.phone,
          gender: assignment.patient.gender,
          ageYears: ageInYears(assignment.patient),
          address: [assignment.patient.address, assignment.patient.city, assignment.patient.state, assignment.patient.pincode].filter(Boolean).join(', '),
          registeredOn: assignment.patient.createdAt,
        }
      : null,
    generatedAt: new Date(),
    summary: {
      questions: questions.length,
      answered: answeredCount,
      notAttended: questions.length - answeredCount,
      percentAnswered: questions.length ? Math.round((answeredCount / questions.length) * 100) : 0,
    },
    questions,
    score,
  };
};

export const updateAssignmentStatus = async (id, status, actor) => {
  const assignment = await Assignment.findById(id).populate('assessment', 'code').populate('patient', 'fullName');
  if (!assignment) throw ApiError.notFound('Assignment not found');
  if (status !== ASSIGNMENT_STATUS.CANCELLED) throw ApiError.badRequest('Only cancellation is supported; completion happens through submission');
  if (assignment.status === ASSIGNMENT_STATUS.COMPLETED) throw ApiError.badRequest('Completed assessments cannot be cancelled');
  assignment.status = ASSIGNMENT_STATUS.CANCELLED;
  await assignment.save();
  await logActivity({
    actor,
    action: ACTIONS.ASSIGNMENT_CANCELLED,
    category: 'assessment',
    message: `${assignment.assessment.code} assignment cancelled for ${assignment.patient.fullName}`,
    entityType: 'Assignment',
    entityId: assignment._id,
    patient: assignment.patient._id,
  });
  return assignment.toObject();
};

/** Staff view of a submission: the exact version snapshot, the stored answers and the calculated result. */
export const getSubmission = async (assignmentId) => {
  const assignment = await Assignment.findById(assignmentId)
    .populate('patient', 'fullName patientCode dateOfBirth gender')
    .populate('assessment', 'code name')
    .lean();
  if (!assignment) throw ApiError.notFound('Assignment not found');
  const [version, response, result] = await Promise.all([
    AssessmentVersion.findById(assignment.assessmentVersion).lean(),
    Response.findOne({ assignment: assignmentId }).lean(),
    AssessmentResult.findOne({ assignment: assignmentId }).populate('reviewedBy', 'name').lean(),
  ]);
  return { assignment, version, response, result };
};
