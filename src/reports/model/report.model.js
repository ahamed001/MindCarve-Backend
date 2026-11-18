import mongoose from 'mongoose';

export const REPORT_TYPES = ['monthly_summary', 'high_risk_followups', 'response_analysis', 'clinician_workload'];

const reportSchema = new mongoose.Schema(
  {
    type: { type: String, enum: REPORT_TYPES, required: true },
    title: { type: String, required: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    periodLabel: String,
    format: { type: String, enum: ['pdf', 'xlsx'], required: true },
    status: { type: String, enum: ['generating', 'ready', 'failed'], default: 'generating', index: true },
    fileName: String,
    mimeType: String,
    sizeBytes: Number,
    file: { type: Buffer, select: false },
    error: String,
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export const Report = mongoose.model('Report', reportSchema);
