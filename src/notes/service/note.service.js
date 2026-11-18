import { ClinicianNote } from '../model/note.model.js';
import { getPatientOr404 } from '../../patients/service/patient.service.js';
import { ACTIONS, logActivity } from '../../activity/service/activity.service.js';

export const listNotes = (patientId) =>
  ClinicianNote.find({ patient: patientId }).sort({ createdAt: -1 }).populate('author', 'name role').lean();

export const addNote = async (patientId, { body, assignment }, actor) => {
  const patient = await getPatientOr404(patientId);
  const note = await ClinicianNote.create({ patient: patient._id, assignment, author: actor._id, body });
  await logActivity({
    actor,
    action: ACTIONS.NOTE_ADDED,
    category: 'clinical',
    message: `${actor.name} added notes for ${patient.fullName}`,
    entityType: 'ClinicianNote',
    entityId: note._id,
    patient: patient._id,
  });
  return ClinicianNote.findById(note._id).populate('author', 'name role').lean();
};
