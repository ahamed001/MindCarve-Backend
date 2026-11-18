import mongoose from 'mongoose';

const noteSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment' },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, maxlength: 5000 },
    // Notes are visible to staff (admin + clinician) only; never returned on patient routes.
    visibility: { type: String, enum: ['staff'], default: 'staff' },
  },
  { timestamps: true },
);

export const ClinicianNote = mongoose.model('ClinicianNote', noteSchema);
