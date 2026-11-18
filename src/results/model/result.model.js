import mongoose from 'mongoose';

const { Mixed } = mongoose.Schema.Types;

const resultSchema = new mongoose.Schema(
  {
    assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true, unique: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    assessment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assessment', required: true, index: true },
    assessmentVersion: { type: mongoose.Schema.Types.ObjectId, ref: 'AssessmentVersion', required: true },
    version: Number,
    status: { type: String, enum: ['scored', 'not_configured', 'incomplete'], required: true },
    total: Mixed,
    subscales: [Mixed],
    outputs: [Mixed],
    riskLevel: { type: String, enum: ['low', 'moderate', 'high', null], default: null, index: true },
    flags: [Mixed],
    itemScores: Mixed, // { itemId: { raw, score, reversed } } as calculated by the scoring engine
    notes: [String],
    reviewStatus: { type: String, enum: ['none', 'flagged', 'reviewed'], default: 'none', index: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    calculatedAt: { type: Date, default: Date.now, index: true },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const AssessmentResult = mongoose.model('AssessmentResult', resultSchema);
