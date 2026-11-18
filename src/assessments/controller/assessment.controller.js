import { sendSuccess } from '../../utils/response.js';
import * as service from '../service/assessment.service.js';

export const list = async (req, res) => sendSuccess(res, { items: await service.listAssessments(req.query) });
export const detail = async (req, res) => sendSuccess(res, await service.getAssessment(req.params.id));
export const archive = async (req, res) => sendSuccess(res, await service.archiveAssessment(req.params.id, req.user), 'Assessment archived');
export const restore = async (req, res) => sendSuccess(res, await service.restoreAssessment(req.params.id, req.user), 'Assessment restored');
export const version = async (req, res) => sendSuccess(res, await service.getVersion(req.params.versionId));
