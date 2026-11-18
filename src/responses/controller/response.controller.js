import { sendSuccess } from '../../utils/response.js';
import { ApiError } from '../../utils/ApiError.js';
import * as service from '../service/response.service.js';
import { Patient } from '../../patients/model/patient.model.js';

// Patient identity always comes from the authenticated session — never from request input.
const patientIdOf = (req) => {
  if (!req.user.patient) throw ApiError.forbidden();
  return req.user.patient;
};

export const profile = async (req, res) => {
  const patient = await Patient.findById(patientIdOf(req)).select('patientCode fullName email phone dateOfBirth gender guardianName createdAt').lean();
  sendSuccess(res, { patient });
};

export const listQuizzes = async (req, res) => sendSuccess(res, { items: await service.listMyQuizzes(patientIdOf(req)) });
export const startQuiz = async (req, res) => sendSuccess(res, await service.startQuiz(patientIdOf(req), req.params.assessmentId, req.user), 'Quiz ready');
export const listAssignments = async (req, res) => sendSuccess(res, { items: await service.listMyAssignments(patientIdOf(req)) });
export const getAssignment = async (req, res) => sendSuccess(res, await service.getMyAssignment(patientIdOf(req), req.params.id));
export const saveProgress = async (req, res) =>
  sendSuccess(res, await service.saveProgress(patientIdOf(req), req.params.id, req.body.answers, req.user), 'Progress saved');
export const submit = async (req, res) =>
  sendSuccess(res, await service.submitAssessment(patientIdOf(req), req.params.id, req.body.answers || [], req.user), 'Assessment submitted');
