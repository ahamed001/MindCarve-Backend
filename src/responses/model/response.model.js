import mongoose from 'mongoose';

const answerSchema = new mongoose.Schema(
  {
    itemId: { type: String, required: true },
    questionNumber: Number,
    value: String, // single-select option value
    values: [String], // multiple-choice option values
    text: { type: String, maxlength: 5000 }, // free text
    selectedLabel: String,
    score: { type: Number, default: null }, // raw option score at answer time (pre-reversal)
    answeredAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const responseSchema = new mongoose.Schema(
  {
    assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true, unique: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    assessmentVersion: { type: mongoose.Schema.Types.ObjectId, ref: 'AssessmentVersion', required: true },
    answers: [answerSchema],
    status: { type: String, enum: ['draft', 'submitted'], default: 'draft' },
    lastSavedAt: Date,
    submittedAt: Date,
  },
  { timestamps: true },
);

export const Response = mongoose.model('Response', responseSchema);
