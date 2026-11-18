import { sendSuccess } from '../../utils/response.js';
import * as patientService from '../service/patient.service.js';
import { assignAssessments, getPatientAssignments } from '../../assignments/service/assignment.service.js';
import { getPatientResultHistory } from '../../results/service/result.service.js';
import { addNote, listNotes } from '../../notes/service/note.service.js';

export const list = async (req, res) => sendSuccess(res, await patientService.listPatients(req.query));

export const create = async (req, res) =>
  sendSuccess(res, await patientService.createPatient(req.body, req.user), 'Patient registered and invitation sent', 201);

export const detail = async (req, res) => sendSuccess(res, await patientService.getPatientDetail(req.params.id));

export const update = async (req, res) => sendSuccess(res, await patientService.updatePatient(req.params.id, req.body, req.user), 'Patient updated');

export const setStatus = async (req, res) =>
  sendSuccess(res, await patientService.setPatientStatus(req.params.id, req.body.status, req.user), 'Patient status updated');

export const resendInvitation = async (req, res) =>
  sendSuccess(res, await patientService.resendInvitation(req.params.id, req.user), 'Invitation resent');

export const assignments = async (req, res) => {
  await patientService.getPatientOr404(req.params.id);
  sendSuccess(res, { items: await getPatientAssignments(req.params.id) });
};

export const assign = async (req, res) => {
  const { created, skipped } = await assignAssessments(req.params.id, req.body.assessmentIds, req.body, req.user);
  sendSuccess(res, { created: created.length, skipped }, created.length ? 'Assessment(s) assigned' : 'No new assessments assigned', 201);
};

export const report = async (req, res) => sendSuccess(res, await patientService.getPatientReport(req.params.id));

export const results = async (req, res) => {
  await patientService.getPatientOr404(req.params.id);
  sendSuccess(res, { items: await getPatientResultHistory(req.params.id) });
};

export const notes = async (req, res) => {
  await patientService.getPatientOr404(req.params.id);
  sendSuccess(res, { items: await listNotes(req.params.id) });
};

export const createNote = async (req, res) => sendSuccess(res, await addNote(req.params.id, req.body, req.user), 'Note added', 201);
