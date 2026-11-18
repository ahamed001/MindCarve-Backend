import { Assignment } from '../../assignments/model/assignment.model.js';
import { Patient } from '../../patients/model/patient.model.js';
import { AssessmentResult } from '../../results/model/result.model.js';
import { ActivityLog } from '../../activity/model/activity.model.js';
import { ASSIGNMENT_STATUS } from '../../utils/constants.js';
import { env } from '../../config/env.js';

const TZ = process.env.APP_TIMEZONE || 'Asia/Kolkata';
const dayKey = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const DAY_MS = 24 * 60 * 60 * 1000;

/** Offset (ms) of the configured timezone from UTC at a given instant. */
const tzOffsetMs = (date) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
};

/** Start of the current week (Monday 00:00) in the configured timezone. */
const startOfWeek = (now = new Date()) => {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(now);
  const daysSinceMonday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(weekday);
  const [y, m, d] = dayKey(now).split('-').map(Number);
  const localMidnightAsUtc = Date.UTC(y, m - 1, d - daysSinceMonday);
  return new Date(localMidnightAsUtc - tzOffsetMs(new Date(localMidnightAsUtc)));
};

export const getKpis = async () => {
  const weekStart = startOfWeek();
  const prevWeekStart = new Date(weekStart.getTime() - 7 * DAY_MS);
  const monthAgo = new Date(Date.now() - 30 * DAY_MS);
  const [completedThisWeek, completedLastWeek, registeredPatients, newPatients30d, highRiskFollowUps] = await Promise.all([
    Assignment.countDocuments({ status: ASSIGNMENT_STATUS.COMPLETED, completedAt: { $gte: weekStart } }),
    Assignment.countDocuments({ status: ASSIGNMENT_STATUS.COMPLETED, completedAt: { $gte: prevWeekStart, $lt: weekStart } }),
    Patient.countDocuments({ status: 'active' }),
    Patient.countDocuments({ createdAt: { $gte: monthAgo } }),
    AssessmentResult.countDocuments({ reviewStatus: 'flagged' }),
  ]);
  return { completedThisWeek, completedLastWeek, registeredPatients, newPatients30d, highRiskFollowUps, weekStart, timezone: TZ };
};

export const getAssessmentsByDay = async (days = 7) => {
  const since = new Date(Date.now() - days * DAY_MS);
  const completed = await Assignment.find({ status: ASSIGNMENT_STATUS.COMPLETED, completedAt: { $gte: since } }).select('completedAt').lean();
  const buckets = new Map();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * DAY_MS);
    buckets.set(dayKey(d), { date: dayKey(d), label: new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(d), count: 0 });
  }
  completed.forEach((a) => {
    const bucket = buckets.get(dayKey(a.completedAt));
    if (bucket) bucket.count += 1;
  });
  return [...buckets.values()];
};

export const getRiskDistribution = async (days = 30) => {
  const since = new Date(Date.now() - days * DAY_MS);
  const results = await AssessmentResult.find({ calculatedAt: { $gte: since } }).select('status riskLevel').lean();
  const counts = { low: 0, moderate: 0, high: 0, unclassified: 0, awaiting_configuration: 0 };
  results.forEach((r) => {
    if (r.status === 'not_configured') counts.awaiting_configuration += 1;
    else if (r.riskLevel) counts[r.riskLevel] += 1;
    else counts.unclassified += 1;
  });
  return {
    rangeDays: days,
    total: results.length,
    segments: [
      { key: 'low', label: 'Low', count: counts.low },
      { key: 'moderate', label: 'Moderate', count: counts.moderate },
      { key: 'high', label: 'High', count: counts.high },
      { key: 'unclassified', label: 'No risk bands (e.g. BFI, BEIS)', count: counts.unclassified },
      { key: 'awaiting_configuration', label: 'Scoring not configured', count: counts.awaiting_configuration },
    ],
    note: 'Risk levels come from each assessment’s configured score bands. Defaults require clinician confirmation.',
  };
};

export const getLatestActivity = (limit = 6) =>
  ActivityLog.find().sort({ createdAt: -1 }).limit(limit).populate('patient', 'fullName patientCode').lean();

export const getOverview = async () => {
  const [kpis, byDay, risk, activity] = await Promise.all([getKpis(), getAssessmentsByDay(7), getRiskDistribution(30), getLatestActivity(6)]);
  return { kpis, assessmentsByDay: byDay, riskDistribution: risk, latestActivity: activity, environment: env.nodeEnv };
};
