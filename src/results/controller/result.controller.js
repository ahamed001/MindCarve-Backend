import { sendSuccess } from '../../utils/response.js';
import * as service from '../service/result.service.js';

export const byAssignment = async (req, res) => sendSuccess(res, await service.getResultByAssignment(req.params.assignmentId));
export const subscales = async (req, res) => sendSuccess(res, await service.getSubscaleResults(req.params.assignmentId));
export const calculate = async (req, res) =>
  sendSuccess(res, await service.calculateResult(req.params.assignmentId, { actor: req.user }), 'Result recalculated from the stored version snapshot');
export const review = async (req, res) =>
  sendSuccess(res, await service.updateReviewStatus(req.params.id, req.body.reviewStatus, req.user), 'Review status updated');
