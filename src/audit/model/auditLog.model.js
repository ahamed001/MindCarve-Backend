import mongoose from 'mongoose';
import { ApiError } from '../../utils/ApiError.js';

/**
 * Append-only audit trail of security- and privacy-relevant actions: who did what, to which patient's
 * data, when, from where, and whether it succeeded. Entries can never be updated or deleted.
 */
const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true, index: true },
    outcome: { type: String, enum: ['success', 'failure'], default: 'success', index: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    actorName: String,
    actorEmail: String,
    actorRole: String,
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', index: true },
    patientName: String,
    patientCode: String,
    entityType: String,
    entityId: mongoose.Schema.Types.ObjectId,
    details: String,
    ip: String,
    userAgent: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ createdAt: -1 });

const blockMutation = function blockMutation(next) {
  next(ApiError.badRequest('Audit log entries are append-only'));
};
['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete', 'findOneAndReplace'].forEach((hook) =>
  auditLogSchema.pre(hook, blockMutation),
);
auditLogSchema.pre('save', function onlyNew(next) {
  if (!this.isNew) return next(ApiError.badRequest('Audit log entries are append-only'));
  return next();
});

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
