import { sendSuccess } from '../../utils/response.js';
import * as service from '../service/dashboard.service.js';

export const overview = async (req, res) => sendSuccess(res, await service.getOverview());
export const kpis = async (req, res) => sendSuccess(res, await service.getKpis());
export const byDay = async (req, res) => sendSuccess(res, { items: await service.getAssessmentsByDay(Number(req.query.days) || 7) });
export const risk = async (req, res) => sendSuccess(res, await service.getRiskDistribution(Number(req.query.days) || 30));
export const latestActivity = async (req, res) => sendSuccess(res, { items: await service.getLatestActivity(Number(req.query.limit) || 6) });
