import { sendSuccess } from '../../utils/response.js';
import * as service from '../service/report.service.js';

export const list = async (req, res) => sendSuccess(res, await service.listReports());
export const generate = async (req, res) => sendSuccess(res, await service.generateReport(req.body, req.user), 'Report generation started', 202);
export const detail = async (req, res) => sendSuccess(res, await service.getReport(req.params.id));

export const download = async (req, res) => {
  const report = await service.getReportFile(req.params.id);
  res.setHeader('Content-Type', report.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${report.fileName}"`);
  res.setHeader('Content-Length', report.file.length);
  res.setHeader('Cache-Control', 'no-store');
  res.end(report.file);
};
