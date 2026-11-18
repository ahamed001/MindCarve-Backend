import mongoose from 'mongoose';
import { ASSESSMENT_STATUS, RISK_LEVELS } from '../../utils/constants.js';

const { Mixed } = mongoose.Schema.Types;

export const bandSchema = new mongoose.Schema(
  {
    min: { type: Number, default: null }, // inclusive; null = open
    max: { type: Number, default: null }, // inclusive; null = open
    label: { type: String, required: true },
    value: { type: Mixed }, // optional output value (e.g. disability %)
    riskLevel: { type: String, enum: [...RISK_LEVELS, null], default: null },
    description: String,
  },
  { _id: false },
);

const subscaleSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    name: { type: String, required: true },
    itemIds: [{ type: String }],
    method: { type: String, enum: ['sum', 'mean'], default: 'sum' },
    cutoff: {
      value: Number,
      operator: { type: String, enum: ['gte', 'gt'], default: 'gte' },
      label: String,
    },
    bands: [bandSchema],
    rangeNote: String,
    description: String,
  },
  { _id: false },
);

const outputSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    name: { type: String, required: true },
    source: { type: String, default: 'total' }, // 'total' or a subscale key
    bands: [bandSchema],
    note: String,
  },
  { _id: false },
);

export const scoringSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    status: { type: String, enum: ['configured', 'awaiting_configuration'], default: 'awaiting_configuration' },
    reverseConstant: { type: Number, default: null }, // reversed = reverseConstant - score
    subscaleLabel: { type: String, default: 'Sub-scales' }, // heading for the subscale group, e.g. 'Traits', 'Domains'
    total: {
      enabled: { type: Boolean, default: true },
      method: { type: String, enum: ['sum', 'mean'], default: 'sum' },
      label: { type: String, default: 'Total score' },
      bands: [bandSchema],
    },
    subscales: [subscaleSchema],
    outputs: [outputSchema],
    interpretationNote: String,
  },
  { _id: false },
);

const sectionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    name: { type: String, required: true },
    description: String,
    order: { type: Number, default: 0 },
  },
  { _id: false },
);

const assessmentSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, trim: true, default: '' },
    // Order of cards on the patient "Take a Quiz" screen (lower first).
    displayOrder: { type: Number, default: 100 },
    description: { type: String, default: '' },
    instructions: { type: String, default: '' },
    respondent: { type: String, default: 'Self' },
    timeframe: String,
    sourceReference: String,
    primaryQuestionType: { type: String, default: 'single_choice' },
    status: { type: String, enum: Object.values(ASSESSMENT_STATUS), default: ASSESSMENT_STATUS.DRAFT, index: true },
    sections: [sectionSchema],
    scoring: { type: scoringSchema, default: () => ({}) },
    sourceNotes: [String],
    discrepancies: [String],
    currentVersion: { type: Number, default: 0 },
    publishedVersion: { type: mongoose.Schema.Types.ObjectId, ref: 'AssessmentVersion' },
    hasUnpublishedChanges: { type: Boolean, default: true },
    isSeed: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export const Assessment = mongoose.model('Assessment', assessmentSchema);
