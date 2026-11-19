import mongoose from 'mongoose';

export const ACTIVITY_CATEGORIES = ['patient', 'assessment', 'clinical', 'content', 'system'];

const activitySchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actorName: String,
    actorRole: String,
    action: { type: String, required: true, index: true },
    category: { type: String, enum: ACTIVITY_CATEGORIES, required: true, index: true },
    message: { type: String, required: true },
    entityType: String,
    entityId: mongoose.Schema.Types.ObjectId,
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', index: true },
    metadata: mongoose.Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

activitySchema.index({ createdAt: -1 });

export const ActivityLog = mongoose.model('ActivityLog', activitySchema);
