import { sendSuccess } from '../../utils/response.js';
import * as service from '../service/assignment.service.js';

export const list = async (req, res) => sendSuccess(res, await service.listAssignments(req.query));

export const create = async (req, res) => {
  const { created, skipped } = await service.assignAssessments(req.body.patientId, req.body.assessmentIds, req.body, req.user);
  sendSuccess(res, { created: created.length, skipped }, created.length ? 'Assessment(s) assigned' : 'No new assessments assigned', 201);
};

export const updateStatus = async (req, res) =>
  sendSuccess(res, await service.updateAssignmentStatus(req.params.id, req.body.status, req.user), 'Assignment updated');

export const submission = async (req, res) => sendSuccess(res, await service.getSubmission(req.params.id));

export const byAttemptCode = async (req, res) => sendSuccess(res, await service.findByAttemptCode(req.params.code));
export const report = async (req, res) => sendSuccess(res, await service.getAttemptReport(req.params.id));
