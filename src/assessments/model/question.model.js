import mongoose from 'mongoose';
import { QUESTION_TYPES } from '../../utils/constants.js';

const optionSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    value: { type: String, required: true }, // stored answer identifier
    score: { type: Number, default: null }, // numeric score used by the scoring engine
    description: String,
  },
  { _id: false },
);

const questionSchema = new mongoose.Schema(
  {
    assessment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assessment', required: true, index: true },
    // Stable identifier referenced by scoring rules; never changes when questions are reordered.
    itemId: { type: String, required: true },
    order: { type: Number, required: true },
    sectionKey: { type: String, default: null },
    text: { type: String, required: true, trim: true },
    helpText: String,
    type: { type: String, enum: QUESTION_TYPES, required: true },
    options: [optionSchema],
    required: { type: Boolean, default: true },
    reverseScored: { type: Boolean, default: false },
    excludedFromScoring: { type: Boolean, default: false },
    // Marks content clinicians should see highlighted (e.g. self-harm wording). Not a triage rule.
    sensitive: { type: Boolean, default: false },
    // Clinician-defined: answers (option values) that flag the submission for clinical review.
    reviewTriggerValues: [{ type: String }],
  },
  { timestamps: true },
);

questionSchema.index({ assessment: 1, itemId: 1 }, { unique: true });
questionSchema.index({ assessment: 1, order: 1 });

export const Question = mongoose.model('Question', questionSchema);
