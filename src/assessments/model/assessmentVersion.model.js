import mongoose from 'mongoose';
import { ApiError } from '../../utils/ApiError.js';

const { Mixed } = mongoose.Schema.Types;

// Immutable snapshot of an assessment at publish time. Assignments and results point here so
// later edits never change what a patient answered or how it was scored.
const assessmentVersionSchema = new mongoose.Schema(
  {
    assessment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assessment', required: true, index: true },
    version: { type: Number, required: true },
    code: String,
    name: String,
    description: String,
    instructions: String,
    respondent: String,
    timeframe: String,
    sections: [Mixed],
    questions: [Mixed],
    scoring: Mixed,
    discrepancies: [String],
    publishedAt: { type: Date, default: Date.now },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: false },
);

assessmentVersionSchema.index({ assessment: 1, version: 1 }, { unique: true });

const blockMutation = function blockMutation(next) {
  next(ApiError.badRequest('Assessment versions are immutable'));
};
['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete'].forEach(
  (hook) => assessmentVersionSchema.pre(hook, blockMutation),
);
assessmentVersionSchema.pre('save', function preventResave(next) {
  if (!this.isNew) return next(ApiError.badRequest('Assessment versions are immutable'));
  return next();
});

export const AssessmentVersion = mongoose.model('AssessmentVersion', assessmentVersionSchema);
