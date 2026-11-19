import mongoose from 'mongoose';
import { ASSIGNMENT_STATUS } from '../../utils/constants.js';

const assignmentSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    assessment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assessment', required: true, index: true },
    assessmentVersion: { type: mongoose.Schema.Types.ObjectId, ref: 'AssessmentVersion', required: true },
    version: { type: Number, required: true },
    status: { type: String, enum: Object.values(ASSIGNMENT_STATUS), default: ASSIGNMENT_STATUS.ASSIGNED, index: true },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedAt: { type: Date, default: Date.now },
    dueDate: Date,
    startedAt: Date,
    completedAt: { type: Date, index: true },
    note: { type: String, maxlength: 500 },
  },
  { timestamps: true },
);

export const Assignment = mongoose.model('Assignment', assignmentSchema);
