import { Report } from '../model/report.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { env } from '../../config/env.js';
import { ACTIONS, logActivity } from '../../activity/service/activity.service.js';
import { highRiskData, monthlySummaryData, responseAnalysisData, workloadData } from './reportData.service.js';
import { buildHighRiskPdf, buildMonthlySummaryPdf, buildResponseAnalysisXlsx, buildWorkloadXlsx } from './reportBuilders.js';

const MIME = { pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

export const REPORT_DEFINITIONS = {
  monthly_summary: {
    title: 'Monthly assessment summary',
    format: 'pdf',
    description: 'Completed and assigned assessments, new patients and risk breakdown by instrument.',
    build: async (s, e, label) => buildMonthlySummaryPdf(await monthlySummaryData(s, e), label),
  },
  high_risk_followups: {
    title: 'High-risk patient follow-ups',
    format: 'pdf',
    description: 'Results in a high risk band or flagged for clinical review, with review status.',
    build: async (s, e, label) => buildHighRiskPdf(await highRiskData(s, e), label),
  },
  response_analysis: {
    title: 'Question response analysis',
    format: 'xlsx',
    description: 'Answer distribution per question for every assessment version submitted in the period.',
    build: async (s, e, label) => buildResponseAnalysisXlsx(await responseAnalysisData(s, e), label),
  },
  clinician_workload: {
    title: 'Clinician / counsellor workload',
    format: 'xlsx',
    description: 'Registrations, assignments, notes and reviews per staff member.',
    build: async (s, e, label) => buildWorkloadXlsx(await workloadData(s, e), label),
  },
};

export const parseMonth = (month) => {
  const match = /^(\d{4})-(\d{2})$/.exec(month || '');
  if (!match) throw ApiError.badRequest('Month must be in YYYY-MM format');
  const year = Number(match[1]);
  const m = Number(match[2]) - 1;
  if (m < 0 || m > 11) throw ApiError.badRequest('Invalid month');
  const start = new Date(Date.UTC(year, m, 1));
  const end = new Date(Date.UTC(year, m + 1, 1));
  if (start > new Date()) throw ApiError.badRequest('Cannot generate a report for a future period');
  const label = start.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return { start, end, label };
};

const runGeneration = async (reportId, definition, start, end, label, actor) => {
  try {
    const buffer = await definition.build(start, end, label);
    if (!buffer?.length) throw new Error('Generated file was empty');
    await Report.updateOne(
      { _id: reportId },
      { status: 'ready', file: buffer, sizeBytes: buffer.length, mimeType: MIME[definition.format] },
    );
    await logActivity({
      actor,
      action: ACTIONS.REPORT_GENERATED,
      category: 'system',
      message: `${actor.name} generated "${definition.title}" for ${label}`,
      entityType: 'Report',
      entityId: reportId,
    });
  } catch (error) {
    if (!env.isTest) console.error('[reports] generation failed', error);
    await Report.updateOne({ _id: reportId }, { status: 'failed', error: 'Report generation failed. Please try again.' });
  }
};

export const generateReport = async ({ type, month }, actor, { wait = false } = {}) => {
  const definition = REPORT_DEFINITIONS[type];
  if (!definition) throw ApiError.badRequest('Unknown report type');
  const { start, end, label } = parseMonth(month);

  const report = await Report.create({
    type,
    title: definition.title,
    periodStart: start,
    periodEnd: end,
    periodLabel: label,
    format: definition.format,
    status: 'generating',
    fileName: `athma-${type.replace(/_/g, '-')}-${month}.${definition.format}`,
    requestedBy: actor._id,
  });

  const job = runGeneration(report._id, definition, start, end, label, actor);
  if (wait) await job;
  return Report.findById(report._id).lean();
};

export const listReports = async () => {
  const reports = await Report.find().sort({ createdAt: -1 }).limit(50).populate('requestedBy', 'name').lean();
  return {
    definitions: Object.entries(REPORT_DEFINITIONS).map(([key, d]) => ({ type: key, title: d.title, format: d.format, description: d.description })),
    reports,
  };
};

export const getReport = async (id) => {
  const report = await Report.findById(id).lean();
  if (!report) throw ApiError.notFound('Report not found');
  return report;
};

export const getReportFile = async (id) => {
  const report = await Report.findById(id).select('+file');
  if (!report) throw ApiError.notFound('Report not found');
  if (report.status !== 'ready' || !report.file?.length) throw ApiError.conflict('This report is not ready for download');
  return report;
};
